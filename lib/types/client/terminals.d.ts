/**
 * Terminal-group model for the terminal tab.
 *
 * The Workspace list itself belongs to the Host and is read live from the
 * Client `workspaces` service (see {@link createWorkspaceBridge}); this module
 * owns only the part the Host does not know about: which named consoles each
 * Workspace group holds, their titles, and the tiny account persisted across
 * page reloads. Every list operation is pure so the React half can treat the
 * account as immutable state.
 */
/** One named console inside a Workspace (or session) group. */
export interface TerminalDef {
    readonly id: string;
    readonly title: string;
}
/** Console lists keyed by Workspace id, plus the session fallback key. */
export type TerminalAccount = Readonly<Record<string, readonly TerminalDef[]>>;
/** Group key of the pseudo console bound to the session's own workdir. */
export declare const SESSION_KEY = "__session__";
/**
 * Read a group's consoles. Groups start empty by design: nothing is seeded,
 * so an unknown group and an emptied group both answer `[]`.
 * @param account - current account.
 * @param key - group key.
 * @returns a fresh array the caller may replace.
 */
export declare function terminalsFor(account: TerminalAccount, key: string): TerminalDef[];
/**
 * Replace one group's console list, leaving the other groups shared.
 * @param account - current account.
 * @param key - group key.
 * @param list - the group's next console list.
 * @returns the next account.
 */
export declare function withTerminalList(account: TerminalAccount, key: string, list: readonly TerminalDef[]): TerminalAccount;
/**
 * Append a console named after its position.
 * @param list - current group list.
 * @param key - group key.
 * @returns the next group list.
 */
export declare function addTerminal(list: readonly TerminalDef[], key: string): TerminalDef[];
/**
 * Rename one console; blank input is ignored rather than stored.
 * @param list - current group list.
 * @param id - console to rename.
 * @param title - requested title.
 * @returns the next group list.
 */
export declare function renameTerminal(list: readonly TerminalDef[], id: string, title: string): TerminalDef[];
/**
 * Remove one console. Any console may go, including a group's last one: the
 * group then simply holds none until the user adds another.
 * @param list - current group list.
 * @param id - console to remove.
 * @returns the next group list.
 */
export declare function removeTerminal(list: readonly TerminalDef[], id: string): TerminalDef[];
/**
 * Read the persisted account, dropping anything that does not match the shape
 * (a hand-edited or older entry must not break the tab).
 * @returns the validated account, or an empty one.
 */
export declare function loadAccount(): TerminalAccount;
/**
 * Persist the account. Storage failures (quota, blocked third-party storage)
 * are not worth surfacing: the consoles keep working for this page's lifetime.
 * @param account - account to persist.
 */
export declare function saveAccount(account: TerminalAccount): void;
/**
 * Read the persisted expanded group keys.
 *
 * Only expansion is stored: a group missing from the list is collapsed, which
 * makes "collapsed" the state every group starts in.
 * @returns the validated keys, or an empty list.
 */
export declare function loadExpanded(): string[];
/**
 * Persist the expanded group keys.
 * @param keys - group keys currently expanded.
 */
export declare function saveExpanded(keys: readonly string[]): void;
/** The Live Workspace row fields this UI reads. */
export interface WorkspaceRow {
    readonly workspaceId: string;
    readonly path: string;
    readonly title: string;
}
/** The part of a Workspace snapshot this UI reads. */
export interface WorkspaceSnapshotLike {
    readonly items: readonly WorkspaceRow[];
}
/**
 * The bare observable the Client `workspaces` service exposes as `.list`.
 * Declared structurally so this package needs no module dependency on the
 * controller package.
 */
export interface WorkspaceSourceLike {
    getSnapshot(): WorkspaceSnapshotLike;
    subscribe(listener: () => void): () => void;
}
/**
 * Late-bound subscription to the Workspace service.
 *
 * The terminal tab must exist even in a composition that never provides the
 * service, so the plugin attaches through a child fiber and this bridge holds
 * the service when it appears. `getSnapshot` always returns the same object
 * while nothing changed, which is what `useSyncExternalStore` requires.
 */
export interface WorkspaceBridge {
    attach(source: WorkspaceSourceLike): () => void;
    subscribe(listener: () => void): () => void;
    getSnapshot(): WorkspaceSnapshotLike;
}
/**
 * Create the late-bound Workspace bridge.
 *
 * The bridge owns the snapshot identity React needs: `useSyncExternalStore`
 * loops forever when `getSnapshot` answers a fresh object every call, and a
 * source is only obliged to be correct, not identity-stable. The cached
 * snapshot is refreshed exactly on attach and on a source notification.
 *
 * @returns a bridge safe to read before any service has attached.
 */
export declare function createWorkspaceBridge(): WorkspaceBridge;
//# sourceMappingURL=terminals.d.ts.map