/**
 * Client half of the package-private bridge to the Host routes.
 *
 * Every route answers JSON and never rejects: a transport failure becomes an
 * `{ ok: false }` result the caller renders as one error line. Terminal output
 * is the exception — it arrives on the SSE stream at {@link streamUrl}, which
 * the browser's own `EventSource` owns.
 */
export interface ContextResult {
    readonly ok: boolean;
    readonly workdir?: string;
    readonly error?: string;
}
export interface OpenResult {
    readonly ok: boolean;
    readonly terminalId?: string;
    readonly pid?: number;
    readonly cwd?: string;
    readonly shell?: string;
    readonly user?: string;
    readonly host?: string;
    readonly error?: string;
}
export interface ActionResult {
    readonly ok: boolean;
    readonly delivered?: boolean;
    readonly targetPgid?: number;
    readonly error?: string;
}
/** Ask which workdir the Host would use for this session. */
export declare function fetchContext(sessionId?: string): Promise<ContextResult>;
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
 *
 * `consoleId` is the stable browser-side console id. The Host keys live
 * sessions by it, so a reloaded page asking for the same console gets its
 * existing shell back (with the output it already printed) instead of a new
 * one.
 */
export declare function openTerminal(sessionId: string | undefined, workspaceId: string | undefined, cols: number, rows: number, consoleId: string): Promise<OpenResult>;
/** Deliver keystrokes exactly as typed (no implicit newline conversion). */
export declare function sendInput(terminalId: string, data: string): Promise<ActionResult>;
/** Signal the terminal's foreground process group, e.g. `SIGINT` for Ctrl+C. */
export declare function sendSignal(terminalId: string, signal: string): Promise<ActionResult>;
/** Terminate a console's whole process session. */
export declare function closeTerminal(terminalId: string): Promise<ActionResult>;
/** The SSE endpoint streaming one console's output. */
export declare function streamUrl(terminalId: string): string;
//# sourceMappingURL=api.d.ts.map