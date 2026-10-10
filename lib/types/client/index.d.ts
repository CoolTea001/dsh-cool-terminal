/**
 * Client entry for dsh-cool-terminal.
 *
 * The Workspace controller is an OPTIONAL collaborator: the tab must keep
 * working in a composition that never provides it, so it is attached through a
 * child fiber (`ctx.inject`) instead of a hard `inject` entry on this plugin,
 * and it only feeds the sidebar its live workspace list.
 */
export declare const name = "dsh-cool-terminal/client";
export declare const inject: string[];
export declare function apply(ctx: any): void;
//# sourceMappingURL=index.d.ts.map