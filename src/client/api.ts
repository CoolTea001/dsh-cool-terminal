/**
 * Client half of the package-private bridge to the Host routes.
 *
 * Both routes answer JSON and never reject: a transport failure becomes an
 * `{ ok: false }` result the caller renders as one error line.
 */

const BASE = '/dsh-cool-terminal/api'

export interface ContextResult {
  readonly ok: boolean
  readonly workdir?: string
  readonly error?: string
}

export interface ExecResult {
  readonly ok: boolean
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode?: number | null
  readonly timedOut?: boolean
  readonly cwd?: string
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
 * Run one foreground command through the Host `shell` seam.
 *
 * `workspaceId` names the Workspace the command must run in; the Host resolves
 * its directory from its own registry. Omitting it runs in the session's own
 * workdir, which is what the session-bound console does.
 */
export function execCommand(
  command: string,
  sessionId?: string,
  workspaceId?: string,
): Promise<ExecResult> {
  return postJson('/exec', { command, sessionId, workspaceId })
}
