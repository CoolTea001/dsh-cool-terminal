/**
 * The terminal tab: a Workspace sidebar on the left and the active console on
 * the right.
 *
 * The sidebar mirrors the Host Workspace list through the Client `workspaces`
 * service, so creating, renaming, reordering, or deleting a Workspace in DSH's
 * own sidebar shows up here without a reload. Each group holds one or more
 * named consoles; every console owns a real PTY on the Host and an xterm.js
 * instance in the browser, so its scrollback, current directory, running
 * command, and shell state all survive switching Views.
 *
 * Runtime objects live in this closure keyed by console id, not in React
 * state, so unmounting the View keeps every shell alive; the closure belongs to
 * the plugin instance and is disposed with the plugin's fiber. The converse is
 * also true and just as important: those runtimes *outlive* the View that first
 * showed them, so everything they call back into — the completion sink, the
 * command list, the re-render — is looked up late through `ViewContext` rather
 * than captured from whichever mount happened to create them.
 */
import * as React from 'react';
import { type WorkspaceBridge } from './terminals.js';
import type { Translate } from './locales.js';
/** The result of {@link createTerminalView}. */
export interface TerminalViewHandle {
    /** The Conversation View component to register into `conversation.view`. */
    readonly View: React.ComponentType<any>;
    /** Close every PTY and dispose every xterm instance. */
    dispose(): void;
}
/**
 * Build the View component and its teardown.
 * @param bridge - late-bound Workspace list source.
 * @param t - translator for every string the tab renders, including the ones
 *   written outside React (the failure banner, the exit status).
 * @returns the Conversation View component plus a plugin-lifetime disposer.
 */
export declare function createTerminalView(bridge: WorkspaceBridge, t: Translate): TerminalViewHandle;
//# sourceMappingURL=terminal.d.ts.map