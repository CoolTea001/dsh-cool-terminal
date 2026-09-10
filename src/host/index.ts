/**
 * Host entry for dsh-cool-terminal.
 *
 * The browser half owns the terminal UI. Every keystroke and every byte of
 * output crosses back to this half over same-origin HTTP routes, because an
 * out-of-tree bundle cannot generate a `ctx.remote` namespace and its Client
 * half never sees the Host Cordis context.
 *
 * The terminal itself is a real PTY obtained from the `subprocess` seam
 * (`spawnTerminal`): this half only owns the registry, the bounded replay
 * buffer, and the SSE fan-out. Sizing is fixed at spawn time because the seam
 * exposes no resize verb — the browser measures its viewport before asking for
 * a terminal, so the initial size is the size the user sees.
 */

import { hostname, userInfo } from 'node:os'
import { basename } from 'node:path'

export const name = 'dsh-cool-terminal'

/** The web carrier is a hard dependency: without it there is no route to serve. */
export const inject = ['webServer']

/** Route table, kept in one place so both halves cannot drift. */
export const ROUTES = {
  context: '/dsh-cool-terminal/api/context',
  open: '/dsh-cool-terminal/api/open',
  stream: '/dsh-cool-terminal/api/stream',
  input: '/dsh-cool-terminal/api/input',
  signal: '/dsh-cool-terminal/api/signal',
  close: '/dsh-cool-terminal/api/close',
} as const

/** Signals the subprocess terminal primitive accepts for the foreground group. */
const TERMINAL_SIGNALS = new Set(['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGTSTP', 'SIGHUP'])

/** Terminal geometry bounds; the browser's measurement is clamped into them. */
const MIN_COLS = 20
const MAX_COLS = 400
const MIN_ROWS = 5
const MAX_ROWS = 200
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

/** Replay kept per console so a reload rejoins the same shell with context. */
const MAX_REPLAY_BYTES = 256 * 1024

/** Terminal cleanup grace before SIGKILL when a session is closed. */
const GRACE_MS = 3_000

/** A console left with no attached browser is reaped after this long. */
const IDLE_MS = 15 * 60 * 1000

/** SSE comment cadence; keeps intermediaries from closing an idle stream. */
const KEEPALIVE_MS = 20_000

/** How long a finished console's record stays answerable before it is dropped. */
const EXITED_TTL_MS = 5 * 60 * 1000

interface OpenBody {
  readonly sessionId?: unknown
  readonly workspaceId?: unknown
  readonly cols?: unknown
  readonly rows?: unknown
  /**
   * Stable browser-side console id. It is the reattachment key: a reloaded
   * page asks for its own console again and gets the same live PTY back
   * instead of a fresh shell.
   */
  readonly consoleId?: unknown
}

/** One live (or recently exited) PTY plus the browsers attached to it. */
interface PtySession {
  readonly id: string
  /** Console id this session was opened for; empty when the caller named none. */
  readonly key: string
  readonly handle: any
  readonly cwd: string
  readonly shell: string
  readonly pid: number
  /** Terminal output retained for replay, bounded by {@link MAX_REPLAY_BYTES}. */
  replay: Buffer[]
  replayBytes: number
  readonly clients: Set<any>
  exited: { exitCode: number | null; signal: string | null } | null
  /** Serializes writes so keystrokes keep their order across HTTP requests. */
  writes: Promise<void>
  idle: NodeJS.Timeout | undefined
  keepalive: NodeJS.Timeout | undefined
  reap: NodeJS.Timeout | undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sendJson(res: any, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req: any): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array))
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return {}
  const parsed: unknown = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

/**
 * Reject a state-changing cross-site request.
 *
 * The routes are localhost-trusted, but a PTY is a stronger hammer than one
 * command, so a request that declares a foreign origin is refused instead of
 * being handed a shell. A same-origin `fetch` omits `Origin` on some GETs, so
 * an absent header is allowed.
 */
function sameOrigin(req: any): boolean {
  const origin = req.headers?.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/**
 * Resolve the workdir a session was created with.
 *
 * `sessions.get` only answers for a live session, so a cold or foreign id
 * falls back to the executor's own default instead of guessing.
 */
function workdirFor(ctx: any, sessionId: unknown): string | undefined {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  const sessions = ctx.get('sessions')
  if (sessions === undefined) return undefined
  try {
    const session = sessions.get(sessionId)
    const cwd = session?.header?.cwd
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

/**
 * The directory this process would run an unqualified command in.
 *
 * Asking the `shell` seam keeps this consistent with the one-shot bash tool
 * instead of hard-coding the harness process's own cwd.
 */
function defaultWorkdir(ctx: any): string {
  const shell = ctx.get('shell')
  if (shell !== undefined) {
    try {
      const spec = shell.resolve({ command: 'pwd' })
      if (typeof spec?.workdir === 'string' && spec.workdir !== '') return spec.workdir
    } catch {
      /* fall through to the process cwd */
    }
  }
  return process.cwd()
}

/**
 * Resolve the directory a request must run in.
 *
 * Two mutually exclusive sources, both Host-authoritative:
 *
 * - `workspaceId` names a registered Workspace; its canonical directory comes
 *   from the Host registry, so the browser never chooses an arbitrary path.
 *   An unknown id is an error rather than a silent fallback: running in the
 *   wrong directory is worse than refusing.
 * - otherwise the session's own workdir, the original single-console behavior.
 */
function resolveWorkdir(
  ctx: any,
  body: { readonly sessionId?: unknown; readonly workspaceId?: unknown },
): { workdir?: string; error?: string } {
  if (typeof body.workspaceId === 'string' && body.workspaceId !== '') {
    const registry = ctx.get('workspaceRegistry')
    if (registry === undefined) return { error: 'workspace registry unavailable' }
    try {
      const workspace = registry.get(body.workspaceId)
      if (workspace === undefined) return { error: `unknown workspace: ${body.workspaceId}` }
      const path = workspace.path
      if (typeof path === 'string' && path !== '') return { workdir: path }
      return { error: `workspace has no directory: ${body.workspaceId}` }
    } catch (error) {
      return { error: messageOf(error) }
    }
  }
  return { workdir: workdirFor(ctx, body.sessionId) }
}

/** The user's login shell, or the platform's fallback interpreter. */
function resolveShell(): string {
  const configured = process.env.SHELL
  if (typeof configured === 'string' && configured !== '') return configured
  if (process.platform === 'win32') return process.env.COMSPEC ?? 'cmd.exe'
  return '/bin/sh'
}

/** Interactive argv for the resolved shell. */
function shellArgv(shell: string): string[] {
  // A PTY alone usually makes a shell interactive, but `-i` removes the doubt;
  // `-l` is deliberately omitted because a login profile may `cd` away from the
  // Workspace directory the console is bound to.
  return process.platform === 'win32' ? [shell] : [shell, '-i']
}

function sendEvent(res: any, event: string | undefined, data: unknown): void {
  const head = event === undefined ? '' : `event: ${event}\n`
  res.write(`${head}data: ${JSON.stringify(data)}\n\n`)
}

/** One chunked, base64-encoded output frame. */
function sendOutput(res: any, bytes: Buffer): void {
  sendEvent(res, undefined, { d: bytes.toString('base64') })
}

/**
 * The PTY registry: one entry per console, shared by every route.
 *
 * It is created per plugin instance and torn down with the plugin's fiber, so
 * stopping or reloading the plugin does not leave orphan shells behind.
 */
class PtyRegistry {
  private readonly sessions = new Map<string, PtySession>()
  /** Console id to live session id, so a reloaded page rejoins its own shell. */
  private readonly byKey = new Map<string, string>()
  /** In-flight allocations per console id, so concurrent opens share one shell. */
  private readonly pending = new Map<
    string,
    Promise<{ session: PtySession } | { error: string; status: number }>
  >()
  private sequence = 0

  constructor(private readonly ctx: any) {}

  get(id: unknown): PtySession | undefined {
    return typeof id === 'string' ? this.sessions.get(id) : undefined
  }

  /** The console id naming this request, or '' when the caller gave none. */
  private keyOf(body: OpenBody): string {
    return typeof body.consoleId === 'string' && body.consoleId !== '' ? body.consoleId : ''
  }

  /**
   * The live session a console id is already bound to, if any.
   *
   * A session that has exited is dropped rather than reused: reattaching would
   * hand the user a console whose shell can never come back, which is worse
   * than a fresh prompt.
   */
  private liveFor(key: string): PtySession | undefined {
    const id = this.byKey.get(key)
    if (id === undefined) return undefined
    const session = this.sessions.get(id)
    if (session !== undefined && session.exited === null) return session
    if (session !== undefined) this.forget(session)
    else this.byKey.delete(key)
    return undefined
  }

  /** Drop a session from both indexes and cancel its timers. */
  private forget(session: PtySession): void {
    this.sessions.delete(session.id)
    if (session.key !== '' && this.byKey.get(session.key) === session.id) this.byKey.delete(session.key)
    if (session.idle !== undefined) clearTimeout(session.idle)
    if (session.reap !== undefined) clearTimeout(session.reap)
    session.idle = undefined
    session.reap = undefined
  }

  /**
   * Allocate a terminal, register it, and start pumping its output.
   *
   * When the request names a console that already owns a live session, that
   * session is handed back untouched. This is what makes a page reload rejoin
   * the same shell: without it, the reload would orphan the running shell and
   * silently start a second one, which is exactly the "terminal got reset"
   * symptom.
   */
  async open(body: OpenBody): Promise<{ session: PtySession } | { error: string; status: number }> {
    const key = this.keyOf(body)
    if (key !== '') {
      const existing = this.liveFor(key)
      if (existing !== undefined) {
        this.touch(existing)
        return { session: existing }
      }
      // A remount, or a reload racing the previous page's stream teardown, can
      // issue two opens for one console; they must share one shell.
      const inflight = this.pending.get(key)
      if (inflight !== undefined) return inflight
    }

    const allocation = this.spawn(body, key)
    if (key !== '') {
      this.pending.set(key, allocation)
      const settle = (): void => {
        if (this.pending.get(key) === allocation) this.pending.delete(key)
      }
      void allocation.then(settle, settle)
    }
    return allocation
  }

  /** Cancel the pending reap, since a browser is about to attach again. */
  private touch(session: PtySession): void {
    if (session.idle === undefined) return
    clearTimeout(session.idle)
    session.idle = undefined
  }

  private async spawn(
    body: OpenBody,
    key: string,
  ): Promise<{ session: PtySession } | { error: string; status: number }> {
    const subprocess = this.ctx.get('subprocess')
    if (subprocess === undefined || typeof subprocess.spawnTerminal !== 'function') {
      return { error: 'subprocess service unavailable', status: 503 }
    }

    const target = resolveWorkdir(this.ctx, body)
    if (target.error !== undefined) return { error: target.error, status: 404 }
    const cwd = target.workdir ?? defaultWorkdir(this.ctx)

    const shell = resolveShell()
    const id = `t${Date.now().toString(36)}-${(this.sequence += 1).toString(36)}`
    const cols = clampInt(body.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS)
    const rows = clampInt(body.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS)

    let handle: any
    try {
      handle = await subprocess.spawnTerminal({
        argv: shellArgv(shell),
        cwd,
        env: {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          TERM_PROGRAM: 'dsh-cool-terminal',
        },
        rows,
        cols,
        graceMs: GRACE_MS,
      })
    } catch (error) {
      return { error: messageOf(error), status: 500 }
    }

    const session: PtySession = {
      id,
      key,
      handle,
      cwd,
      shell,
      pid: typeof handle.pid === 'number' ? handle.pid : 0,
      replay: [],
      replayBytes: 0,
      clients: new Set(),
      exited: null,
      writes: Promise.resolve(),
      idle: undefined,
      keepalive: undefined,
      reap: undefined,
    }
    this.sessions.set(id, session)
    if (key !== '') this.byKey.set(key, id)

    handle.output?.on?.('data', (chunk: unknown) => {
      this.broadcast(session, Buffer.from(chunk as Uint8Array))
    })
    handle.output?.on?.('error', () => {
      this.finish(session, { exitCode: null, signal: null }, 'terminal output stream failed')
    })
    void handle.done.then(
      (outcome: any) => this.finish(session, {
        exitCode: typeof outcome?.exitCode === 'number' ? outcome.exitCode : null,
        signal: typeof outcome?.signal === 'string' ? outcome.signal : null,
      }),
      (error: unknown) => this.finish(session, { exitCode: null, signal: null }, messageOf(error)),
    )

    return { session }
  }

  /** Retain output for replay and push it to every attached browser. */
  private broadcast(session: PtySession, bytes: Buffer): void {
    if (bytes.length === 0) return
    session.replay.push(bytes)
    session.replayBytes += bytes.length
    while (session.replayBytes > MAX_REPLAY_BYTES && session.replay.length > 1) {
      const dropped = session.replay.shift()
      session.replayBytes -= dropped?.length ?? 0
    }
    for (const client of session.clients) {
      if (!client.writableEnded) sendOutput(client, bytes)
    }
  }

  /** Attach one SSE response, replaying what the console already printed. */
  attach(session: PtySession, res: any): void {
    if (session.reap !== undefined) {
      clearTimeout(session.reap)
      session.reap = undefined
    }
    if (session.idle !== undefined) {
      clearTimeout(session.idle)
      session.idle = undefined
    }
    session.clients.add(res)
    this.ensureKeepalive(session)

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.flushHeaders?.()
    res.write('retry: 1000\n\n')

    for (const chunk of session.replay) {
      if (res.writableEnded) return
      sendOutput(res, chunk)
    }

    if (session.exited !== null) {
      sendEvent(res, 'exit', session.exited)
      res.end()
      session.clients.delete(res)
      // This attach cancelled the reap timer that keeps a finished console's
      // record around; arm a fresh one so a reconnecting browser still gets its
      // replay without the entry living for the rest of the process.
      this.stopKeepalive(session)
      session.reap = setTimeout(() => {
        this.sessions.delete(session.id)
      }, EXITED_TTL_MS)
      session.reap.unref?.()
      return
    }

    const detach = (): void => {
      session.clients.delete(res)
      if (session.clients.size === 0) {
        this.stopKeepalive(session)
        if (session.exited === null && session.idle === undefined) {
          session.idle = setTimeout(() => {
            session.idle = undefined
            void this.close(session.id)
          }, IDLE_MS)
        }
      }
    }
    res.on('close', detach)
    res.on('error', detach)
  }

  private ensureKeepalive(session: PtySession): void {
    if (session.keepalive !== undefined) return
    session.keepalive = setInterval(() => {
      for (const client of session.clients) {
        if (client.writableEnded) continue
        client.write(':\n\n')
      }
    }, KEEPALIVE_MS)
    session.keepalive.unref?.()
  }

  private stopKeepalive(session: PtySession): void {
    if (session.keepalive === undefined) return
    clearInterval(session.keepalive)
    session.keepalive = undefined
  }

  /** Queue a keystroke behind every earlier one so input order is preserved. */
  write(session: PtySession, data: string): void {
    if (session.exited !== null) return
    session.writes = session.writes
      .then(() => session.handle.write(data))
      .catch(() => undefined)
  }

  private finish(
    session: PtySession,
    exit: { exitCode: number | null; signal: string | null },
    detail?: string,
  ): void {
    if (session.exited !== null) return
    session.exited = exit
    this.stopKeepalive(session)
    if (session.idle !== undefined) {
      clearTimeout(session.idle)
      session.idle = undefined
    }
    if (detail !== undefined) {
      const note = `\r\n\x1b[2m[终端结束: ${detail}]\x1b[0m\r\n`
      this.broadcast(session, Buffer.from(note, 'utf8'))
    }
    for (const client of session.clients) {
      if (client.writableEnded) continue
      sendEvent(client, 'exit', exit)
      client.end()
    }
    session.clients.clear()
    session.reap = setTimeout(() => {
      this.sessions.delete(session.id)
      // Release the console id too, so reopening that console later allocates a
      // fresh shell instead of finding this dead record.
      if (session.key !== '' && this.byKey.get(session.key) === session.id) this.byKey.delete(session.key)
      session.reap = undefined
    }, EXITED_TTL_MS)
    session.reap.unref?.()
  }

  /** Close one console and forget it. */
  async close(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (session === undefined) return
    const live = session.exited === null
    // Settle the session before terminating it: killing the handle resolves its
    // `done`, and a late `finish` must not schedule work for a console that is
    // already gone.
    if (session.exited === null) session.exited = { exitCode: null, signal: null }
    this.forget(session)
    this.stopKeepalive(session)
    for (const client of session.clients) {
      if (!client.writableEnded) client.end()
    }
    session.clients.clear()
    if (live) {
      try {
        await session.handle.terminate()
      } catch {
        /* the process range is already gone */
      }
    }
  }

  /** Terminate every live terminal; used by the plugin's disposer. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(id => this.close(id)))
  }
}

/** Report the workdir the open route would use, without spawning anything. */
async function handleContext(ctx: any, req: any, res: any): Promise<void> {
  const shell = ctx.get('shell')
  if (shell === undefined) {
    sendJson(res, 503, { ok: false, error: 'shell service unavailable' })
    return
  }

  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try {
      body = await readBody(req)
    } catch (error) {
      sendJson(res, 400, { ok: false, error: messageOf(error) })
      return
    }
  } else if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }

  const target = resolveWorkdir(ctx, body)
  if (target.error !== undefined) {
    sendJson(res, 404, { ok: false, error: target.error })
    return
  }

  try {
    const spec = shell.resolve(target.workdir === undefined ? { command: 'pwd' } : { command: 'pwd', workdir: target.workdir })
    sendJson(res, 200, { ok: true, workdir: spec.workdir })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: messageOf(error) })
  }
}

/** Allocate one terminal for a console. */
async function handleOpen(registry: PtyRegistry, req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  let body: OpenBody
  try {
    body = (await readBody(req)) as OpenBody
  } catch (error) {
    sendJson(res, 400, { ok: false, error: messageOf(error) })
    return
  }

  const opened = await registry.open(body)
  if ('error' in opened) {
    sendJson(res, opened.status, { ok: false, error: opened.error })
    return
  }

  const { session } = opened
  let user = ''
  try {
    user = userInfo().username
  } catch {
    /* an unavailable passwd entry is not fatal */
  }
  sendJson(res, 200, {
    ok: true,
    terminalId: session.id,
    pid: session.pid,
    cwd: session.cwd,
    shell: basename(session.shell),
    user,
    host: hostname(),
  })
}

/** Stream one console's output; the response stays open until it exits. */
function handleStream(registry: PtyRegistry, req: any, res: any): void {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  let id: string | null = null
  try {
    id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('terminalId')
  } catch {
    id = null
  }
  const session = registry.get(id ?? undefined)
  if (session === undefined) {
    sendJson(res, 404, { ok: false, error: 'unknown terminal' })
    return
  }
  registry.attach(session, res)
}

/** Deliver keystrokes exactly as typed, without implicit newline conversion. */
async function handleInput(registry: PtyRegistry, req: any, res: any): Promise<void> {
  await mutateSession(registry, req, res, async (session, body) => {
    if (typeof body.data !== 'string' || body.data === '') return { ok: true }
    registry.write(session, body.data)
    return { ok: true }
  })
}

/** Signal the foreground process group (Ctrl+C from the toolbar). */
async function handleSignal(registry: PtyRegistry, req: any, res: any): Promise<void> {
  await mutateSession(registry, req, res, async (session, body) => {
    const signal = typeof body.signal === 'string' ? body.signal : 'SIGINT'
    if (!TERMINAL_SIGNALS.has(signal)) return { error: `unsupported signal: ${signal}`, status: 400 }
    if (session.exited !== null) return { ok: true, delivered: false }
    try {
      const targetPgid = await session.handle.signalForeground(signal)
      return { ok: true, delivered: true, targetPgid }
    } catch (error) {
      // No resolvable foreground group (the shell is idle at its prompt) is a
      // normal answer, not a server failure.
      return { ok: false, error: messageOf(error) }
    }
  })
}

/** Terminate one console's whole process session. */
async function handleClose(registry: PtyRegistry, req: any, res: any): Promise<void> {
  await mutateSession(registry, req, res, async (session) => {
    await registry.close(session.id)
    return { ok: true }
  })
}

/** Shared validation for the POST routes that address one console. */
async function mutateSession(
  registry: PtyRegistry,
  req: any,
  res: any,
  run: (session: PtySession, body: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  let body: Record<string, unknown>
  try {
    body = await readBody(req)
  } catch (error) {
    sendJson(res, 400, { ok: false, error: messageOf(error) })
    return
  }
  const session = registry.get(body.terminalId)
  if (session === undefined) {
    sendJson(res, 404, { ok: false, error: 'unknown terminal' })
    return
  }
  try {
    sendJson(res, 200, await run(session, body))
  } catch (error) {
    sendJson(res, 500, { ok: false, error: messageOf(error) })
  }
}

export function apply(ctx: any): void {
  const registry = new PtyRegistry(ctx)

  /** Every route shares the same cross-site refusal. */
  const guard = (handler: (req: any, res: any) => void | Promise<void>) => (req: any, res: any) => {
    if (!sameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
      return
    }
    return handler(req, res)
  }

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: ROUTES.context, handler: guard((req: any, res: any) => handleContext(ctx, req, res)) }),
      ctx.webServer.register({ kind: 'exact', path: ROUTES.open, handler: guard((req: any, res: any) => handleOpen(registry, req, res)) }),
      ctx.webServer.register({ kind: 'exact', path: ROUTES.stream, handler: guard((req: any, res: any) => handleStream(registry, req, res)) }),
      ctx.webServer.register({ kind: 'exact', path: ROUTES.input, handler: guard((req: any, res: any) => handleInput(registry, req, res)) }),
      ctx.webServer.register({ kind: 'exact', path: ROUTES.signal, handler: guard((req: any, res: any) => handleSignal(registry, req, res)) }),
      ctx.webServer.register({ kind: 'exact', path: ROUTES.close, handler: guard((req: any, res: any) => handleClose(registry, req, res)) }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
      void registry.closeAll()
    }
  }, 'dsh-cool-terminal: terminal routes')
}
