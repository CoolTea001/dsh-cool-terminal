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
export declare const name = "dsh-cool-terminal";
/** The web carrier is a hard dependency: without it there is no route to serve. */
export declare const inject: string[];
/** Route table, kept in one place so both halves cannot drift. */
export declare const ROUTES: {
    readonly context: "/dsh-cool-terminal/api/context";
    readonly open: "/dsh-cool-terminal/api/open";
    readonly stream: "/dsh-cool-terminal/api/stream";
    readonly input: "/dsh-cool-terminal/api/input";
    readonly signal: "/dsh-cool-terminal/api/signal";
    readonly close: "/dsh-cool-terminal/api/close";
};
export declare function apply(ctx: any): void;
//# sourceMappingURL=index.d.ts.map