/**
 * The common-commands dialog.
 *
 * Opens from the sidebar footer's 常用命令 button: a searchable list of saved
 * shell snippets, each row sending its command to the active console. Rows
 * are outlined cards with always-visible icon actions (编辑 / 复制 / 删除);
 * the copy label reports its own success for a second through local feedback
 * state, since the primitives export the clipboard writer but keep their
 * feedback hook private.
 *
 * Adding and editing are inline: 添加命令 (a primary button next to the search
 * field) inserts a form card at the top of the list, and editing a row swaps
 * that row for the same form. The modal stays a single layer — the nested
 * dialog is gone — so the layer's Escape handler is intercepted in the
 * capture phase while a form is open: Escape then cancels the form instead of
 * closing the whole dialog.
 *
 * The command list lives in the View's state (persisted by commands.ts); this
 * component is controlled: it renders what it is handed and reports changes
 * upward.
 */
import * as React from 'react';
import { type CommandDef } from './commands.js';
interface CommandsDialogProps {
    /** Whether the dialog is showing (owner-controlled). */
    open: boolean;
    readonly commands: readonly CommandDef[];
    /** Whether an active console can receive a command right now. */
    sendable: boolean;
    /** Replace the whole list after an add, edit, or delete. */
    onChange: (next: CommandDef[]) => void;
    onClose: () => void;
    /** Send one command to the active console; false means no console can take it. */
    send: (body: string) => boolean;
}
/** The controlled common-commands dialog; render it with `open` toggled by the footer button. */
export declare function CommandsDialog(props: CommandsDialogProps): React.ReactElement;
export {};
//# sourceMappingURL=commands-dialog.d.ts.map