/**
 * Host entry for dsh-cool-terminal.
 *
 * The browser half owns the terminal UI. Every command it runs crosses back to
 * this half over same-origin HTTP routes, because an out-of-tree bundle cannot
 * generate a `ctx.remote` namespace and its Client half never sees the Host
 * Cordis context. The routes are deliberately narrow: validate, resolve the
 * session workdir, run one foreground command through the `shell` seam, and
 * return bounded JSON.
 */

export const name = 'dsh-cool-terminal'

/** The web carrier is a hard dependency: without it there is no route to serve. */
export const inject = ['webServer']

/** Route table, kept in one place so both halves cannot drift. */
export const ROUTES = {
  context: '/dsh-cool-terminal/api/context',
  exec: '/dsh-cool-terminal/api/exec',
} as const

interface ExecBody {
  readonly command?: unknown
  readonly sessionId?: unknown
  readonly workspaceId?: unknown
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
 * Resolve the workdir a session was created with.
 *
 * `sessions.get` only answers for a live session, so a cold or foreign id
 * falls back to the shell implementation's own default instead of guessing.
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

/** Report the workdir the exec route would use, without running anything. */
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

/** Run one foreground command and return its bounded output. */
async function handleExec(ctx: any, req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }

  const shell = ctx.get('shell')
  if (shell === undefined) {
    sendJson(res, 503, { ok: false, error: 'shell service unavailable' })
    return
  }

  let body: ExecBody
  try {
    body = (await readBody(req)) as ExecBody
  } catch (error) {
    sendJson(res, 400, { ok: false, error: messageOf(error) })
    return
  }

  const command = typeof body.command === 'string' ? body.command : ''
  if (command.trim() === '') {
    sendJson(res, 400, { ok: false, error: 'empty command' })
    return
  }

  const target = resolveWorkdir(ctx, body)
  if (target.error !== undefined) {
    sendJson(res, 404, { ok: false, error: target.error })
    return
  }

  let spec: any
  try {
    spec = shell.resolve(target.workdir === undefined ? { command } : { command, workdir: target.workdir })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: messageOf(error) })
    return
  }

  try {
    const result = await shell.run(spec)
    sendJson(res, 200, {
      ok: true,
      stdout: result.stdout ? result.stdout.text : '',
      stderr: result.stderr ? result.stderr.text : '',
      exitCode: result.exitCode === undefined ? null : result.exitCode,
      timedOut: result.timedOut === true,
      cwd: spec.workdir,
    })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: messageOf(error) })
  }
}

export function apply(ctx: any): void {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTES.context, handler: (req: any, res: any) => handleContext(ctx, req, res) }),
    'dsh-cool-terminal: context route',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTES.exec, handler: (req: any, res: any) => handleExec(ctx, req, res) }),
    'dsh-cool-terminal: exec route',
  )
}
