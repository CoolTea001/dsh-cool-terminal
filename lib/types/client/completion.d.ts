/**
 * Inline completion for the console pane: a popup of matching common commands
 * under the caret while the user types, `↑`/`↓` to pick one, `Enter` to fill
 * it into the command line (without running it).
 *
 * The hard part is that xterm is a *screen*, not an input field: keystrokes go
 * to the PTY verbatim and the shell echoes them back, so nothing in the client
 * "owns" the text being typed. This module therefore keeps a shadow model of
 * the current input line and re-verifies it against xterm's screen buffer on
 * every keystroke (see {@link validateLine}) before it may show a popup or —
 * more importantly — before it may send the backspaces that a fill uses to
 * erase the line:
 *
 * - Keystrokes the model understands (printable input, Backspace, arrows,
 *   Home/End, Ctrl+U/K/W, the meta word-delete ⌥/⌘+Backspace sends, …) are
 *   applied to the model directly.
 * - Keystrokes that change the line behind our back (history `↑`/`↓`, shell
 *   completion on Tab, an editor redrawing the row) leave the model stale;
 *   the next keystroke's validation notices, and re-syncs from the screen
 *   when that is provably safe (the prompt is intact and the caret sits at
 *   the end of the line), or marks the model untrusted, which closes the
 *   popup until the line settles again.
 *
 * A popup may only be open while the model is trusted, so a fill only ever
 * erases text the model actually accounts for; everything else degrades to
 * "no suggestions", never to a corrupted prompt. Full-screen applications are
 * excluded at capture time by their modes (application cursor keys — shells
 * never enable it) and by refusing an empty (column-0) prompt as an anchor.
 *
 * Everything here is pure and DOM-free: the caller reads the screen, steps the
 * model, and forwards bytes to the PTY (see terminal.tsx).
 */
import type { CommandDef } from './commands.js';
/** How many matches the popup ever lists (mirrors `.dsh-ct-ac` in styles.ts). */
export declare const MAX_ITEMS = 8;
/** One popup row's height in CSS px — must match `.dsh-ct-ac-row`. */
export declare const ROW_PX = 44;
/** The popup footer's height in CSS px — must match `.dsh-ct-ac-foot`. */
export declare const FOOTER_PX = 22;
/**
 * The popup's full height at its cap: rows + footer + the 4px padding top and
 * bottom + the footer's 2px top margin, plus 2px of slack for the elevation
 * stroke ring (a shadow, so it costs no layout — the card's real height is 2px
 * under this). The caret uses this to decide whether the popup has to flip
 * above the line instead; pricing the upper bound keeps that decision from
 * under-measuring.
 */
export declare const POPUP_MAX_PX: number;
/** The popup's fixed width in CSS px — must match `.dsh-ct-ac`. */
export declare const POPUP_MAX_W = 420;
/**
 * The shadow model of one console's current input line.
 *
 * `promptLen`/`promptText` anchor the model to the screen: a shell prompt is
 * stable while a line is edited, so "column {@link promptLen} onward is the
 * editable text" is what lets validation and a fill find the real line.
 */
export interface LineModel {
    /** What the shell shows after the prompt, as the model believes it. */
    readonly text: string;
    /** Caret index into {@link text}. */
    readonly cursor: number;
    /** The caret's column while the line was empty = the prompt's width. */
    readonly promptLen: number | null;
    /** The row's prefix captured with {@link promptLen}, verified per keystroke. */
    readonly promptText: string;
    /**
     * True while the model is believed to match the screen. The popup may only
     * be open while this holds; a fill may only happen while this holds.
     */
    readonly trusted: boolean;
}
/** A snapshot of the caret's row, read out of xterm's buffer by the caller. */
export interface ScreenState {
    /** The caret's column, `0..cols` (pre-echo: input has not been sent yet). */
    readonly cursorX: number;
    /** The caret's full row, one JS char per cell, unpadded on the right. */
    readonly row: string;
    /** The caret's row within the viewport. */
    readonly caretRow: number;
    readonly rows: number;
    readonly cols: number;
    /**
     * Application cursor keys (DECCKM): full-screen editors turn it on, shells
     * never do, which is what keeps a capture from anchoring inside a TUI.
     */
    readonly appCursorKeys: boolean;
}
/** What the popup shows: the current matches and the highlighted row. */
export interface PopupState {
    readonly items: readonly CommandDef[];
    readonly selected: number;
}
/** One console's completion state: the line model plus a possibly-open popup. */
export interface CompletionSession {
    readonly line: LineModel;
    readonly popup: PopupState | null;
}
/** The caret cell the popup anchors to (see {@link anchorOf}). */
export interface CompletionAnchor {
    readonly row: number;
    readonly col: number;
}
/** What the View renders; published from the keystroke path into React state. */
export interface CompletionView {
    readonly consoleId: string;
    readonly items: readonly CommandDef[];
    readonly selected: number;
    readonly anchor: CompletionAnchor;
}
/** A fresh line: nothing typed, nothing captured, nothing to distrust yet. */
export declare function emptyLine(): LineModel;
/** A fresh session: an empty line and no popup. */
export declare function emptySession(): CompletionSession;
/**
 * Verify (and where safe, repair) the model against what is on screen.
 *
 * Called once per keystroke *before* the keystroke is applied, so the screen
 * shows the echo of everything typed so far — but not of this key.
 *
 * Capture (the model is empty *and* no prompt has been learned yet — the
 * state Enter's reset leaves): the caret sits right after the prompt, which
 * is where the prompt's width and spelling are learned. Captures are refused
 * while application cursor keys are on (a TUI owns the screen) and at column
 * 0 (an empty prompt gives no anchor — and that is exactly where editors
 * like vim leave the caret). An empty model that *does* have a prompt falls
 * through to the checks below, so a history recall re-syncs the recalled
 * line instead of moving the anchor on top of it.
 *
 * With a capture in hand the check is exact: the row must still start with
 * the captured prompt, the caret must sit at `promptLen + cursor`, and both
 * sides of the caret must spell the model. A failed check first tries to
 * re-sync — sound only with the caret at the end of the line and the prompt
 * intact, which is what a history recall or a shell completion leaves behind.
 * Otherwise the model is marked untrusted, which closes the popup. One such
 * "otherwise" is repairable: with an *empty* line there is no text a fill
 * could erase, so a row whose prefix no longer matches the captured prompt
 * re-learns the anchor instead of distrusting every keystroke that follows.
 *
 * The checks are then decided by the *screen*, never by the model's own idea
 * of how long the line is: the row verified above starts with the captured
 * prompt, so the caret is on the prompt row and column arithmetic against
 * that row is sound — even when the model still believes it wrapped past
 * `cols` (the state a fill followed by edits {@link classify} does not decode
 * used to leave behind, which then refused every popup forever). A caret on a
 * real continuation row fails the prompt-prefix check above instead, so no
 * popup ever opens from a wrapped row either way.
 *
 * @param line - the model as of the last keystroke.
 * @param screen - the caret's row read from xterm's buffer.
 * @returns the verified (or repaired, or distrusted) model.
 */
export declare function validateLine(line: LineModel, screen: ScreenState): LineModel;
/** One decoded keystroke. */
type Key = 
/** Enter with no popup: the shell runs the line. */
{
    readonly kind: 'submit';
}
/** A run carrying line breaks (a paste): the shell runs it too. */
 | {
    readonly kind: 'submit-lines';
}
/** Ctrl+C: the line is abandoned. */
 | {
    readonly kind: 'interrupt';
} | {
    readonly kind: 'escape';
} | {
    readonly kind: 'up';
} | {
    readonly kind: 'down';
} | {
    readonly kind: 'left';
} | {
    readonly kind: 'right';
} | {
    readonly kind: 'home';
} | {
    readonly kind: 'end';
} | {
    readonly kind: 'backspace';
} | {
    readonly kind: 'delete';
}
/** Ctrl+U: discard from the line start to the caret. */
 | {
    readonly kind: 'kill-start';
}
/** Ctrl+K: discard from the caret to the line end. */
 | {
    readonly kind: 'kill-end';
}
/** Ctrl+W: discard the word before the caret. */
 | {
    readonly kind: 'kill-word';
} | {
    readonly kind: 'insert';
    readonly text: string;
}
/** Anything else: forwarded untouched, understood only by re-validation. */
 | {
    readonly kind: 'other';
};
/**
 * Decode one `onData` payload.
 *
 * Sequences the model tracks are named; everything else — unknown CSI
 * sequences, Tab, Ctrl+L, a paste with line breaks — falls through to
 * `other`/`submit-lines`, where the model stands still and the next
 * validation decides what actually happened on screen.
 */
export declare function classify(data: string): Key;
/**
 * The popup's matches for what is typed so far.
 *
 * Matching mirrors the dialog's search (body or description, case-
 * insensitive) so the two surfaces agree, with two differences: a blank line
 * suggests nothing (the popup appears while *typing*, not at a bare prompt),
 * and a body already typed in full is dropped — there is nothing left to
 * fill. Only the whole line is matched: a compound line such as
 * `cd ~ && pnpm` never matches a single saved command, so a fill can never
 * discard text the user typed in front of it.
 */
export declare function matchCommands(commands: readonly CommandDef[], text: string): CommandDef[];
/** The result of {@link stepKey}. */
export interface StepResult {
    readonly session: CompletionSession;
    /** Bytes for the PTY; null when the popup consumed the keystroke. */
    readonly forward: string | null;
}
/**
 * The keystroke state machine: the second half of one `onData` turn.
 *
 * The caller has already re-validated {@link CompletionSession.line}; this
 * function decides what the popup does with the key and what the shell sees:
 *
 * - While a popup is open, `↑`/`↓` move the selection, `Escape` dismisses,
 *   and `Enter` fills the selected command — those are consumed.
 * - Everything else is forwarded to the PTY verbatim, with the model updated
 *   where the model understands the key.
 *
 * An untrusted model may not swallow anything: the popup is closed first, so
 * a line the model lost track of still reaches the shell untouched.
 *
 * @param session - the current line and popup.
 * @param data - the raw `onData` payload.
 * @param commands - the live common-command list.
 */
export declare function stepKey(session: CompletionSession, data: string, commands: readonly CommandDef[]): StepResult;
/**
 * The bytes that replace the current line with `body` — and the resulting
 * model. No newline: the filled command waits at the prompt for the user.
 *
 * Ctrl+E puts the caret at the line end (readline, zsh, and fish all bind
 * it), then one Backspace per modeled character erases the line. Extra
 * backspaces past the start of the editable buffer are no-ops in a line
 * editor — they cannot eat the prompt — so a model one keystroke ahead of an
 * in-flight echo still erases exactly the line rather than too much of it.
 *
 * Only ever called while the popup is open, i.e. while the model is trusted.
 */
export declare function fillLine(line: LineModel, body: string): {
    forward: string;
    line: LineModel;
};
/**
 * The caret cell for the popup's anchor, in viewport coordinates.
 *
 * The screen snapshot is pre-echo (the key has not been sent yet), but the
 * column is taken from the *model* — `promptLen + cursor` — so the popup
 * tracks the caret instead of lagging a character behind it. Rows are
 * approximate only when the line wraps (the wrap itself is not added), which
 * costs at most one row of misplacement in a rare case.
 *
 * Null when no prompt has been captured — which cannot coincide with an open
 * popup, since an open popup implies a trusted, non-empty, captured line.
 */
export declare function anchorOf(line: LineModel, screen: ScreenState): CompletionAnchor | null;
/**
 * Reference equality for the fields the popup renders, so a keystroke that
 * changes nothing (typing with no popup open, for one) publishes no React
 * state at all and the View does not re-render.
 */
export declare function sameCompletionView(a: CompletionView | null, b: CompletionView | null): boolean;
export {};
//# sourceMappingURL=completion.d.ts.map