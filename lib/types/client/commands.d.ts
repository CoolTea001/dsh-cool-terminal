/**
 * Common-command model for the terminal tab.
 *
 * A common command is a reusable shell snippet the user saves once and sends
 * to any console later. The list is global (not per-Workspace): a run-book
 * like `pnpm dev` applies wherever it is invoked. The account persists across
 * page reloads exactly like the console account does (see terminals.ts), and
 * every list operation is pure so the React half can treat the account as
 * immutable state.
 */
/** One saved shell snippet. */
export interface CommandDef {
    readonly id: string;
    /** The shell line to send. */
    readonly body: string;
    /** What the command does; shown under the command body. */
    readonly description: string;
}
/** Read the saved commands. Malformed entries are dropped, not fatal. */
export declare function loadCommands(): CommandDef[];
/**
 * Persist the commands. Storage failures (quota, blocked third-party storage)
 * are not worth surfacing: the commands keep working for this page's lifetime.
 */
export declare function saveCommands(commands: readonly CommandDef[]): void;
/**
 * Append a command.
 * @param list - current list.
 * @param body - the shell snippet.
 * @param description - what the command does.
 * @returns the next list.
 */
export declare function addCommand(list: readonly CommandDef[], body: string, description: string): CommandDef[];
/**
 * Replace a command's body and description. Ignored when the body is blank.
 * @param list - current list.
 * @param id - command to replace.
 */
export declare function updateCommand(list: readonly CommandDef[], id: string, body: string, description: string): CommandDef[];
/** Remove one command; removing an absent id is a harmless no-op. */
export declare function removeCommand(list: readonly CommandDef[], id: string): CommandDef[];
/**
 * Filter the list by a free-text needle. Both the command body and its
 * description match, case-insensitively.
 */
export declare function filterCommands(list: readonly CommandDef[], query: string): CommandDef[];
//# sourceMappingURL=commands.d.ts.map