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

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, hostname, userInfo } from 'node:os'
import { basename, join } from 'node:path'

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

/**
 * Where the plugin keeps state that belongs to it rather than to a Workspace.
 *
 * A console's history is the tab's own bookkeeping, so it lives under the
 * user's home instead of inside the project the console runs in.
 */
const STATE_DIR = join(homedir(), '.dsh-cool-terminal')

/** One shell history file per console, named after its console id. */
const HISTORY_DIR = join(STATE_DIR, 'history')

/** Generated zsh startup directory that gives zsh a per-console `HISTFILE`. */
const ZSH_SHIM_DIR = join(STATE_DIR, 'zdotdir')

/** Startup files the zsh shim mirrors so the user's own configuration still runs. */
const ZSH_SHIM_LINKS = ['.zshenv', '.zprofile', '.zlogin', '.zlogout'] as const

/** Fallback history sizes for a shell whose own startup files set none. */
const DEFAULT_HISTSIZE = 10_000

/** Real terminfo entries to prefer over the forced `dumb`, best first. */
const TERMINFO_CANDIDATES = ['xterm-256color', 'xterm'] as const

/** bash appends the pending line to `HISTFILE` on demand; see {@link historyEnv}. */
const BASH_HISTORY_FLUSH = 'history -a'

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

/** A terminal allocation: the session, or the refusal a route renders as JSON. */
type OpenOutcome = { session: PtySession } | { error: string; status: number }

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

/**
 * Answer 405 unless the request uses one of the allowed methods.
 *
 * @returns true when the handler may proceed.
 */
function methodAllowed(req: any, res: any, allowed: readonly string[]): boolean {
  if (allowed.includes(req.method)) return true
  sendJson(res, 405, { ok: false, error: 'method not allowed' })
  return false
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

/**
 * A filesystem-safe, collision-free stem for one console id.
 *
 * Console ids are browser-generated and may hold characters a path cannot
 * (`:` separates the group key from the console's own suffix), so every unsafe
 * run collapses to `_`. The hash suffix is what keeps distinct ids apart after
 * that collapse — `a:b` and `a_b` both sanitize to `a_b`.
 */
function historyStem(consoleId: string): string {
  const readable = consoleId.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 48)
  const digest = createHash('sha1').update(consoleId).digest('hex').slice(0, 10)
  return `${readable}-${digest}`
}

/** Single-quote a value for embedding in a generated zsh startup file. */
function zshQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * The `.zshrc` of the generated shim.
 *
 * zsh cannot be handed a history file through the environment: `HISTFILE` is a
 * parameter zsh initializes itself, and macOS `/etc/zshrc` even derives it from
 * `ZDOTDIR` as `${ZDOTDIR:-$HOME}/.zsh_history`. `ZDOTDIR` *is* read from the
 * environment, so pointing it at this generated directory is the only lever
 * left — which in turn means the shim has to keep the real configuration
 * working: the user's own `.zshrc` is sourced first, then `HISTFILE` is
 * overridden, so everything the user configured still applies.
 *
 * `INC_APPEND_HISTORY` is what makes the history survive a restart. Without it
 * zsh writes `HISTFILE` only when it exits, so a DSH restart (or the idle
 * reaper) kills the shell before anything is saved. With it, each command is
 * appended as it is entered, and the file is already current when the shell
 * dies.
 *
 * The shim also repairs `TERM` (see {@link resolveTerminfoName}). It runs after
 * the user's own configuration, so a `.zshrc` that sets `TERM` itself still
 * wins; only a shell left on the forced `dumb` is re-pointed.
 *
 * @param userZdotdir - the real `$ZDOTDIR` (or home) the shim stands in for.
 * @returns the file body.
 */
function zshShimRc(userZdotdir: string): string {
  return [
    '# Generated by dsh-cool-terminal; rewritten on every terminal start.',
    '# It exists so each console keeps its own shell history.',
    `CT_USER_ZDOTDIR=${zshQuote(userZdotdir)}`,
    'if [[ -r ${CT_USER_ZDOTDIR}/.zshrc ]]; then',
    '  source "${CT_USER_ZDOTDIR}/.zshrc"',
    'fi',
    '# The PTY provider forces the terminal name to `dumb`, whose terminfo entry',
    '# cannot address or erase cells: zsh then repaints a line by overwriting it',
    '# with spaces, which blanks the prompt. zle reads TERM only now, on first',
    '# use, so a real entry restores editing. Left alone if the user set TERM.',
    'if [[ ${TERM} == dumb && -n ${CT_TERM-} ]]; then',
    '  export TERM=${CT_TERM}',
    'fi',
    'if [[ -n ${CT_HISTFILE-} ]]; then',
    '  HISTFILE=${CT_HISTFILE}',
    `  : \${HISTSIZE:=${DEFAULT_HISTSIZE}}`,
    `  : \${SAVEHIST:=${DEFAULT_HISTSIZE}}`,
    '  setopt INC_APPEND_HISTORY',
    'fi',
    '',
  ].join('\n')
}

/**
 * The symlink target of `link`, or undefined when it is absent or not a link.
 *
 * @param link - path to inspect.
 * @returns the recorded target, if any.
 */
function linkTarget(link: string): string | undefined {
  try {
    return readlinkSync(link)
  } catch {
    return undefined
  }
}

/**
 * Make `link` point at `source`, or remove it when `source` does not exist.
 *
 * Re-linked on every start rather than trusted when present: the home directory
 * (and so the real `ZDOTDIR`) may have moved since the last run, and a stale
 * link would silently drop the user's configuration.
 *
 * @param source - the real startup file to mirror.
 * @param link - the shim entry to point at it.
 */
function relink(source: string, link: string): void {
  if (!existsSync(source)) {
    rmSync(link, { force: true })
    return
  }
  if (linkTarget(link) === source) return
  rmSync(link, { force: true })
  symlinkSync(source, link)
}

/**
 * Create (or refresh) the zsh startup shim and return its directory.
 *
 * Every failure is swallowed by the caller: a shim that cannot be written costs
 * one console its private history, and must never keep that console from
 * starting.
 *
 * @param userZdotdir - the real `$ZDOTDIR` (or home) to mirror.
 * @returns the shim directory, or undefined when it could not be prepared.
 */
function ensureZshShim(userZdotdir: string): string | undefined {
  try {
    mkdirSync(ZSH_SHIM_DIR, { recursive: true })
    for (const name of ZSH_SHIM_LINKS) relink(join(userZdotdir, name), join(ZSH_SHIM_DIR, name))
    writeFileSync(join(ZSH_SHIM_DIR, '.zshrc'), zshShimRc(userZdotdir))
    return ZSH_SHIM_DIR
  } catch {
    return undefined
  }
}

/**
 * Directories ncurses searches for a compiled terminfo entry.
 *
 * `TERMINFO` names one directory, `TERMINFO_DIRS` is a colon list where an empty
 * element means "the system default", and the rest are the conventional
 * fallbacks. Only non-empty entries matter, so the empty ones are dropped.
 */
function terminfoDirs(): string[] {
  const configured = (process.env.TERMINFO_DIRS ?? '').split(':')
  const dirs = [
    process.env.TERMINFO,
    ...configured,
    '/etc/terminfo',
    '/usr/share/terminfo',
    '/usr/lib/terminfo',
    '/lib/terminfo',
    '/usr/local/share/terminfo',
  ]
  return dirs.filter((dir): dir is string => typeof dir === 'string' && dir !== '')
}

/** True when `name` resolves to a compiled terminfo entry. */
function hasTerminfoEntry(name: string): boolean {
  // Both bucket spellings ncurses accepts: the first letter, or its hex code.
  const buckets = [name.charAt(0), name.charCodeAt(0).toString(16)]
  return terminfoDirs().some(dir => buckets.some(bucket => existsSync(join(dir, bucket, name))))
}

/**
 * A terminfo entry that actually describes the xterm.js screen.
 *
 * `subprocess-local` hands node-pty `name: 'dumb'`, and node-pty overwrites the
 * spawned environment's `TERM` with that name, so every console's shell
 * believes it is on a dumb terminal. That entry has no cursor addressing
 * (`cup`/`cub1`/`cuf1`) and no erase-to-end-of-line (`el`), so zsh's line editor
 * pans the cursor by overwriting cells with spaces: pasting a command, or
 * editing mid-line, repaints the prompt as blanks. `TERM` is only consulted
 * when the line editor initializes — after the shell's startup file has run —
 * so the shim can repair this by re-exporting a real entry.
 *
 * @returns the entry name to export, or undefined when none is installed.
 */
function resolveTerminfoName(): string | undefined {
  return TERMINFO_CANDIDATES.find(hasTerminfoEntry)
}

/**
 * Environment that gives one console its own shell history.
 *
 * Each console gets its own history file, so ↑ recalls only what that console
 * ran and the commands typed here never reach the user's own `~/.zsh_history`.
 * The file outlives the shell: reopening the same console (even after a DSH
 * restart) reloads the commands it ran before.
 *
 * Both shells are also told to flush as they go, because DSH never lets a shell
 * exit cleanly — a restart and the idle reaper both kill it.
 *
 * @param shell - the resolved shell path.
 * @param consoleId - the browser-side console id, the history's identity.
 * @returns extra environment entries; empty when history cannot be isolated.
 */
function historyEnv(shell: string, consoleId: string): Record<string, string> {
  if (consoleId === '') return {}
  const file = join(HISTORY_DIR, `${historyStem(consoleId)}.history`)
  try {
    mkdirSync(HISTORY_DIR, { recursive: true })
  } catch {
    return {}
  }

  const env: Record<string, string> = { HISTFILE: file }
  if (basename(shell) === 'zsh') {
    const userZdotdir = process.env.ZDOTDIR ?? homedir()
    const shim = ensureZshShim(userZdotdir)
    if (shim === undefined) return env
    env.ZDOTDIR = shim
    env.CT_HISTFILE = file
    const term = resolveTerminfoName()
    if (term !== undefined) env.CT_TERM = term
    return env
  }

  // bash honors `HISTFILE` directly, but like zsh it writes that file only when
  // it exits — which a restart never lets it do. `history -a` at every prompt
  // appends each command as soon as the prompt returns. A `.bashrc` that sets
  // its own `PROMPT_COMMAND` replaces this value, and that console then falls
  // back to bash's exit-time behavior.
  const ambientPrompt = process.env.PROMPT_COMMAND
  env.PROMPT_COMMAND = ambientPrompt === undefined || ambientPrompt === ''
    ? BASH_HISTORY_FLUSH
    : `${ambientPrompt}; ${BASH_HISTORY_FLUSH}`
  return env
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
  private readonly pending = new Map<string, Promise<OpenOutcome>>()
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
    this.cancelIdle(session)
    this.cancelReap(session)
  }

  /** Cancel the pending idle reap, because a browser is about to attach again. */
  private cancelIdle(session: PtySession): void {
    if (session.idle === undefined) return
    clearTimeout(session.idle)
    session.idle = undefined
  }

  /** Cancel a scheduled record reap, because something is about to read it. */
  private cancelReap(session: PtySession): void {
    if (session.reap === undefined) return
    clearTimeout(session.reap)
    session.reap = undefined
  }

  /**
   * Keep a finished console's record answerable for a while, so a reconnecting
   * browser still gets its replay, then drop the record and release its id.
   */
  private scheduleReap(session: PtySession): void {
    this.cancelReap(session)
    session.reap = setTimeout(() => {
      this.forget(session)
    }, EXITED_TTL_MS)
    session.reap.unref?.()
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
  async open(body: OpenBody): Promise<OpenOutcome> {
    const key = this.keyOf(body)
    if (key !== '') {
      const existing = this.liveFor(key)
      if (existing !== undefined) {
        this.cancelIdle(existing)
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

  private async spawn(body: OpenBody, key: string): Promise<OpenOutcome> {
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

    // A PTY child always reports TERM=dumb, no matter what TERM says below.
    // subprocess-local hands node-pty a fixed `name: 'dumb'`, and node-pty then
    // runs `env.TERM = opt.name || env.TERM || 'xterm'`, so its own override wins
    // (verified against this Host's running `subprocess` service). picocolors —
    // and so Vite's logger — only colors output when `isTTY && TERM !== 'dumb'`,
    // and the second half was false even though the PTY is a genuine TTY.
    // FORCE_COLOR=3 restores ANSI explicitly at truecolor depth, matching
    // COLORTERM above; xterm.js renders it.
    //
    // Color was the visible half of that override; line editing was the other.
    // The zsh shim re-exports a real terminfo entry from the environment it
    // receives below, because `TERM` here is discarded and zle reads `TERM` too
    // late for anything this half could set directly.
    const env: Record<string, string> = {
      // Currently discarded by the override above; kept so color is correct for
      // free if the provider ever stops forcing the terminal name.
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'dsh-cool-terminal',
      FORCE_COLOR: '3',
    }
    // picocolors tests NO_COLOR *before* FORCE_COLOR, so an inherited NO_COLOR
    // would veto color regardless of the line above. This Host does not set one
    // today, but a user export would silently re-monochrome the tab, so drop it.
    // The provider documents an `undefined` entry as a tombstone that removes an
    // ambient value (`targetEnvironment` filters `entry[1] !== undefined`); the
    // terminal spec's `Record<string, string>` type just cannot express that.
    ;(env as Record<string, string | undefined>).NO_COLOR = undefined

    // Per-console shell history; `key` is the browser-side console id, so the
    // same console keeps its history across a reload and a DSH restart.
    Object.assign(env, historyEnv(shell, key))

    let handle: any
    try {
      handle = await subprocess.spawnTerminal({
        argv: shellArgv(shell),
        cwd,
        env,
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
    this.cancelReap(session)
    this.cancelIdle(session)
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
      this.scheduleReap(session)
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
    this.cancelIdle(session)
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
    // Keep the record answerable for a while (a reconnecting browser still gets
    // its replay), then release the console id so reopening that console later
    // allocates a fresh shell instead of finding this dead record.
    this.scheduleReap(session)
  }

  /** Close one console and forget it. */
  async close(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (session === undefined) return
    const live = session.exited === null
    // Settle the session before terminating it: killing the handle resolves its
    // `done`, and a late `finish` must not schedule work for a console that is
    // already gone.
    if (live) session.exited = { exitCode: null, signal: null }
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

  if (!methodAllowed(req, res, ['GET', 'POST'])) return

  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try {
      body = await readBody(req)
    } catch (error) {
      sendJson(res, 400, { ok: false, error: messageOf(error) })
      return
    }
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
  if (!methodAllowed(req, res, ['POST'])) return
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
  if (!methodAllowed(req, res, ['GET'])) return
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
  await mutateSession(registry, req, res, (session, body) => {
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
  run: (
    session: PtySession,
    body: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<void> {
  if (!methodAllowed(req, res, ['POST'])) return
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

  /** Register one exact route behind that shared guard. */
  const route = (path: string, handler: (req: any, res: any) => void | Promise<void>): (() => void) =>
    ctx.webServer.register({ kind: 'exact', path, handler: guard(handler) })

  ctx.effect(() => {
    const disposers = [
      route(ROUTES.context, (req, res) => handleContext(ctx, req, res)),
      route(ROUTES.open, (req, res) => handleOpen(registry, req, res)),
      route(ROUTES.stream, (req, res) => handleStream(registry, req, res)),
      route(ROUTES.input, (req, res) => handleInput(registry, req, res)),
      route(ROUTES.signal, (req, res) => handleSignal(registry, req, res)),
      route(ROUTES.close, (req, res) => handleClose(registry, req, res)),
    ]
    return () => {
      for (const dispose of disposers) dispose()
      void registry.closeAll()
    }
  }, 'dsh-cool-terminal: terminal routes')
}
