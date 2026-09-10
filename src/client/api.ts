/**
 * Client half of the package-private bridge to the Host routes.
 *
 * Every route answers JSON and never rejects: a transport failure becomes an
 * `{ ok: false }` result the caller renders as one error line. Terminal output
 * is the exception — it arrives on the SSE stream at {@link streamUrl}, which
 * the browser's own `EventSource` owns.
 */

const BASE = '/dsh-cool-terminal/api'

export interface ContextResult {
  readonly ok: boolean
  readonly workdir?: string
  readonly error?: string
}

export interface OpenResult {
  readonly ok: boolean
  readonly terminalId?: string
  readonly pid?: number
  readonly cwd?: string
  readonly shell?: string
  readonly user?: string
  readonly host?: string
  readonly error?: string
}

export interface ActionResult {
  readonly ok: boolean
  readonly delivered?: boolean
  readonly targetPgid?: number
  readonly error?: string
}

async function postJson(path: string, body: unknown): Promise<any> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
    const payload: unknown = await response.json().catch(() => null)
    if (payload === null || typeof payload !== 'object') {
      return { ok: false, error: `HTTP ${response.status}` }
    }
    return payload
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Ask which workdir the Host would use for this session. */
export function fetchContext(sessionId?: string): Promise<ContextResult> {
  return postJson('/context', { sessionId })
}

/**
 * Allocate a real PTY for one console.
 *
 * `cols`/`rows` are the browser's measurement of the visible terminal: the
 * subprocess seam exposes no resize verb, so the size chosen here is the size
 * the shell lives at for its whole lifetime.
 *
 * `workspaceId` names the Workspace the terminal must start in; the Host
 * resolves its directory from its own registry. Omitting it uses the session's
 * own workdir, which is what the session-bound console does.
 */
export function openTerminal(
  sessionId: string | undefined,
  workspaceId: string | undefined,
  cols: number,
  rows: number,
): Promise<OpenResult> {
  return postJson('/open', { sessionId, workspaceId, cols, rows })
}

/** Deliver keystrokes exactly as typed (no implicit newline conversion). */
export function sendInput(terminalId: string, data: string): Promise<ActionResult> {
  return postJson('/input', { terminalId, data })
}

/** Signal the terminal's foreground process group, e.g. `SIGINT` for Ctrl+C. */
export function sendSignal(terminalId: string, signal: string): Promise<ActionResult> {
  return postJson('/signal', { terminalId, signal })
}

/** Terminate a console's whole process session. */
export function closeTerminal(terminalId: string): Promise<ActionResult> {
  return postJson('/close', { terminalId })
}

/** The SSE endpoint streaming one console's output. */
export function streamUrl(terminalId: string): string {
  return `${BASE}/stream?terminalId=${encodeURIComponent(terminalId)}`
}
