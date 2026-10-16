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
 * never enable it) and by refusing an empty (column-0) prompt as an anchor;
 * everything else that is not a shell prompt is excluded from the outside, by
 * the caller running this module only while the shell owns the terminal's
 * foreground (see terminal.tsx), plus {@link interactivePrompt} for the
 * questions a shell asks itself through a builtin like `read`.
 *
 * Everything here is pure and DOM-free: the caller reads the screen, steps the
 * model, and forwards bytes to the PTY (see terminal.tsx).
 */

import type { CommandDef } from './commands.js'

/** How many matches the popup ever lists (mirrors `.dsh-ct-ac` in styles.ts). */
export const MAX_ITEMS = 8

/** One popup row's height in CSS px — must match `.dsh-ct-ac-row`. */
export const ROW_PX = 44

/** The popup footer's height in CSS px — must match `.dsh-ct-ac-foot`. */
export const FOOTER_PX = 22

/**
 * The popup's full height at its cap: rows + footer + the 4px padding top and
 * bottom + the footer's 2px top margin, plus 2px of slack for the elevation
 * stroke ring (a shadow, so it costs no layout — the card's real height is 2px
 * under this). The caret uses this to decide whether the popup has to flip
 * above the line instead; pricing the upper bound keeps that decision from
 * under-measuring.
 */
export const POPUP_MAX_PX = MAX_ITEMS * ROW_PX + FOOTER_PX + 12

/** The popup's fixed width in CSS px — must match `.dsh-ct-ac`. */
export const POPUP_MAX_W = 420

/**
 * The shadow model of one console's current input line.
 *
 * `promptLen`/`promptText` anchor the model to the screen: a shell prompt is
 * stable while a line is edited, so "column {@link promptLen} onward is the
 * editable text" is what lets validation and a fill find the real line.
 */
export interface LineModel {
  /** What the shell shows after the prompt, as the model believes it. */
  readonly text: string
  /** Caret index into {@link text}. */
  readonly cursor: number
  /** The caret's column while the line was empty = the prompt's width. */
  readonly promptLen: number | null
  /** The row's prefix captured with {@link promptLen}, verified per keystroke. */
  readonly promptText: string
  /**
   * True while the model is believed to match the screen. The popup may only
   * be open while this holds; a fill may only happen while this holds.
   */
  readonly trusted: boolean
}

/** A snapshot of the caret's row, read out of xterm's buffer by the caller. */
export interface ScreenState {
  /** The caret's column, `0..cols` (pre-echo: input has not been sent yet). */
  readonly cursorX: number
  /** The caret's full row, one JS char per cell, unpadded on the right. */
  readonly row: string
  /** The caret's row within the viewport. */
  readonly caretRow: number
  readonly rows: number
  readonly cols: number
  /**
   * Application cursor keys (DECCKM): full-screen editors turn it on, shells
   * never do, which is what keeps a capture from anchoring inside a TUI.
   */
  readonly appCursorKeys: boolean
}

/** What the popup shows: the current matches and the highlighted row. */
export interface PopupState {
  readonly items: readonly CommandDef[]
  readonly selected: number
}

/** One console's completion state: the line model plus a possibly-open popup. */
export interface CompletionSession {
  readonly line: LineModel
  readonly popup: PopupState | null
}

/** The caret cell the popup anchors to (see {@link anchorOf}). */
export interface CompletionAnchor {
  readonly row: number
  readonly col: number
}

/** What the View renders; published from the keystroke path into React state. */
export interface CompletionView {
  readonly consoleId: string
  readonly items: readonly CommandDef[]
  readonly selected: number
  readonly anchor: CompletionAnchor
}

/** A fresh line: nothing typed, nothing captured, nothing to distrust yet. */
export function emptyLine(): LineModel {
  return { text: '', cursor: 0, promptLen: null, promptText: '', trusted: true }
}

/** A fresh session: an empty line and no popup. */
export function emptySession(): CompletionSession {
  return { line: emptyLine(), popup: null }
}

/**
 * True when `text` is a run of literal characters safe to insert.
 *
 * C0/C1 control characters (below 0x20, and 0x7f–0x9f) are not literal text —
 * a paste carrying them is a keystroke sequence, not content. Astral code
 * units are surrogate halves, which are deliberately *not* control, so emoji
 * and CJK pass. Written as a scan instead of a regular expression so that no
 * literal control character ever appears in this source file.
 */
function isLiteralRun(text: string): boolean {
  if (text === '') return false
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false
  }
  return true
}

/**
 * Anchor the model to the prompt under the caret: the prompt's width and
 * spelling are read from the row (`0..cursorX`), and the empty model they
 * belong to is trusted again.
 */
function capturePrompt(line: LineModel, screen: ScreenState): LineModel {
  return {
    ...line,
    promptLen: screen.cursorX,
    promptText: screen.row.slice(0, screen.cursorX),
    trusted: true,
  }
}

/** The model no longer matches the screen; the popup must close over it. */
function distrust(line: LineModel): LineModel {
  return { ...line, trusted: false }
}

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
export function validateLine(line: LineModel, screen: ScreenState): LineModel {
  // A TUI can own the screen at any moment without a line reset of our own
  // (a program started from a dialog insert, say); its redraws are not a
  // prompt, so never trust one.
  if (screen.appCursorKeys) return distrust(line)
  if (line.text === '' && line.promptLen === null) {
    // The first keystroke of a line (Enter reset the model, so no prompt has
    // been learned yet): the caret sits right after the prompt, which is
    // where the prompt's width and spelling are read. Column 0 is refused —
    // an empty prompt gives no anchor, and that is exactly where editors
    // like vim leave the caret.
    if (screen.cursorX === 0) return distrust(line)
    return capturePrompt(line, screen)
  }
  // Otherwise the checks below also cover an empty model with a known
  // prompt — the state a history recall leaves behind: the caret no longer
  // sits at `promptLen`, which sends it through the re-sync instead of a
  // re-capture that would swallow the recalled text into the anchor.
  const promptLen = line.promptLen
  if (promptLen === null) return distrust(line)
  // The row prefix must still be the prompt we captured: a prompt that
  // changed (or a capture taken from mid-output, later overwritten by the
  // real prompt) invalidates every column arithmetic below. An empty line has
  // no text a fill could erase, so there the anchor is re-learned from the
  // row the caret actually sits at — column 0 still refused, and only when
  // nothing follows the caret, since a row with a tail is mid-output rather
  // than a prompt. Any other stale anchor stays untrusted, which closes the
  // popup.
  if (screen.row.slice(0, promptLen) !== line.promptText) {
    if (line.text === '' && screen.cursorX > 0 && screen.row.slice(screen.cursorX).trim() === '') {
      return capturePrompt(line, screen)
    }
    return distrust(line)
  }

  // The caret's row starts with the captured prompt, so it *is* the prompt
  // row: compare from `promptLen` and, on any disagreement, re-adopt what the
  // screen shows. Decided by the screen rather than by `promptLen + cursor`
  // versus `cols`, so a model whose cursor still sits past the wrap threshold
  // — a fill whose later edits arrived as keystrokes {@link classify} does
  // not decode, say — simply disagrees on `cursorX` and is brought back in
  // line here instead of distrusting every following keystroke forever.
  if (screen.cursorX !== promptLen + line.cursor) return resyncLine(line, screen, promptLen)
  const tail = Math.min(line.text.length - line.cursor, screen.row.length - screen.cursorX)
  const before = screen.row.slice(promptLen, screen.cursorX)
  const after = screen.row.slice(screen.cursorX, screen.cursorX + tail)
  if (before === line.text.slice(0, line.cursor) && after === line.text.slice(line.cursor, line.cursor + tail)) {
    return { ...line, trusted: true }
  }
  return resyncLine(line, screen, promptLen)
}

/**
 * Re-adopt the line the screen actually shows, or give up.
 *
 * Safe only with the caret at the end of the line: everything after it has to
 * be blank (a right-side prompt keeps this from re-syncing, which is the
 * conservative direction — the popup just stays closed). The row prefix is
 * the captured prompt (verified by the caller), so slicing from `promptLen`
 * yields the editable text and never the prompt itself.
 */
function resyncLine(line: LineModel, screen: ScreenState, promptLen: number): LineModel {
  if (screen.cursorX < promptLen) return distrust(line)
  if (screen.row.slice(screen.cursorX).trim() !== '') return distrust(line)
  const text = screen.row.slice(promptLen, screen.cursorX)
  return { ...line, text, cursor: text.length, trusted: true }
}

/** One decoded keystroke. */
type Key =
  /** Enter with no popup: the shell runs the line. */
  | { readonly kind: 'submit' }
  /** A run carrying line breaks (a paste): the shell runs it too. */
  | { readonly kind: 'submit-lines' }
  /** Ctrl+C: the line is abandoned. */
  | { readonly kind: 'interrupt' }
  | { readonly kind: 'escape' }
  | { readonly kind: 'up' }
  | { readonly kind: 'down' }
  | { readonly kind: 'left' }
  | { readonly kind: 'right' }
  | { readonly kind: 'home' }
  | { readonly kind: 'end' }
  | { readonly kind: 'backspace' }
  | { readonly kind: 'delete' }
  /** Ctrl+U: discard from the line start to the caret. */
  | { readonly kind: 'kill-start' }
  /** Ctrl+K: discard from the caret to the line end. */
  | { readonly kind: 'kill-end' }
  /** Ctrl+W: discard the word before the caret. */
  | { readonly kind: 'kill-word' }
  | { readonly kind: 'insert'; readonly text: string }
  /** Anything else: forwarded untouched, understood only by re-validation. */
  | { readonly kind: 'other' }

/**
 * One raw byte as a string (ESC, CR, LF, …), so no control character ever
 * appears as a literal in this source file.
 */
function byte(value: number): string {
  return String.fromCharCode(value)
}

/** The single-byte keys the model decodes, keyed by their raw byte. */
const SINGLE_KEYS: Record<string, Key> = {
  [byte(13)]: { kind: 'submit' },
  [byte(10)]: { kind: 'submit' },
  [byte(3)]: { kind: 'interrupt' },
  [byte(27)]: { kind: 'escape' },
  [byte(1)]: { kind: 'home' },
  [byte(5)]: { kind: 'end' },
  [byte(4)]: { kind: 'delete' },
  [byte(127)]: { kind: 'backspace' },
  [byte(8)]: { kind: 'backspace' },
  [byte(21)]: { kind: 'kill-start' },
  [byte(11)]: { kind: 'kill-end' },
  [byte(23)]: { kind: 'kill-word' },
}

/**
 * The escape sequences the model decodes, keyed by their raw bytes.
 *
 * `ESC DEL`/`ESC BS` are the meta word-delete a shell receives from
 * ⌥/⌘+Backspace (`macOptionIsMeta` turns the modifier into ESC): decoded as
 * {@link Key} `kill-word`, they shrink the model together with the screen.
 * Left as `other` they would freeze the model while the shell keeps erasing —
 * the state that, once a fill had wrapped the line, refused every popup for
 * the rest of the line because the stale cursor never left the wrap branch.
 * The word boundaries are only an approximation of the shell's; the next
 * {@link validateLine} re-syncs the exact text when they disagree.
 */
const SEQUENCE_KEYS: Record<string, Key> = {
  [byte(27) + '[A']: { kind: 'up' },
  [byte(27) + '[B']: { kind: 'down' },
  [byte(27) + '[D']: { kind: 'left' },
  [byte(27) + '[C']: { kind: 'right' },
  [byte(27) + '[H']: { kind: 'home' },
  [byte(27) + '[1~']: { kind: 'home' },
  [byte(27) + 'OH']: { kind: 'home' },
  [byte(27) + '[F']: { kind: 'end' },
  [byte(27) + '[4~']: { kind: 'end' },
  [byte(27) + 'OF']: { kind: 'end' },
  [byte(27) + '[3~']: { kind: 'delete' },
  [byte(27) + byte(127)]: { kind: 'kill-word' },
  [byte(27) + byte(8)]: { kind: 'kill-word' },
}

/**
 * Decode one `onData` payload.
 *
 * Sequences the model tracks are named; everything else — unknown CSI
 * sequences, Tab, Ctrl+L, a paste with line breaks — falls through to
 * `other`/`submit-lines`, where the model stands still and the next
 * validation decides what actually happened on screen.
 */
export function classify(data: string): Key {
  const single = SINGLE_KEYS[data]
  if (single !== undefined) return single
  const sequence = SEQUENCE_KEYS[data]
  if (sequence !== undefined) return sequence
  const cr = byte(13)
  const lf = byte(10)
  if (data.includes(cr) || data.includes(lf)) return { kind: 'submit-lines' }
  // Bracketed paste wraps the payload in `200~`/`201~`; strip the markers and
  // keep the literal body. Without markers a paste arrives as a plain run.
  const esc = byte(27)
  const unwrapped = data.split(esc + '[200~').join('').split(esc + '[201~').join('')
  const text = unwrapped === data ? data : unwrapped
  if (isLiteralRun(text)) return { kind: 'insert', text }
  return { kind: 'other' }
}

/**
 * Apply one non-consumed keystroke to the model.
 *
 * Sequence-only keys (`left`, `home`, …) are modeled; keys the shell may act
 * on in a way we cannot predict (`escape`, history `up`/`down`, `other`) leave
 * the model alone — the next {@link validateLine} is what notices.
 */
function applyKey(line: LineModel, key: Key): LineModel {
  switch (key.kind) {
    case 'submit':
    case 'submit-lines':
    case 'interrupt':
      // The line is gone: the next keystroke re-learns the new prompt.
      return emptyLine()
    case 'insert': {
      const text = line.text.slice(0, line.cursor) + key.text + line.text.slice(line.cursor)
      return { ...line, text, cursor: line.cursor + key.text.length }
    }
    case 'backspace': {
      if (line.cursor === 0) return line
      const text = line.text.slice(0, line.cursor - 1) + line.text.slice(line.cursor)
      return { ...line, text, cursor: line.cursor - 1 }
    }
    case 'delete': {
      if (line.cursor >= line.text.length) return line
      const text = line.text.slice(0, line.cursor) + line.text.slice(line.cursor + 1)
      return { ...line, text }
    }
    case 'left':
      return { ...line, cursor: Math.max(0, line.cursor - 1) }
    case 'right':
      return { ...line, cursor: Math.min(line.text.length, line.cursor + 1) }
    case 'home':
      return { ...line, cursor: 0 }
    case 'end':
      return { ...line, cursor: line.text.length }
    case 'kill-start': {
      if (line.cursor === 0) return line
      return { ...line, text: line.text.slice(line.cursor), cursor: 0 }
    }
    case 'kill-end': {
      if (line.cursor >= line.text.length) return line
      return { ...line, text: line.text.slice(0, line.cursor) }
    }
    case 'kill-word': {
      let index = line.cursor
      while (index > 0 && line.text[index - 1] === ' ') index -= 1
      while (index > 0 && line.text[index - 1] !== ' ') index -= 1
      if (index === line.cursor) return line
      const text = line.text.slice(0, index) + line.text.slice(line.cursor)
      return { ...line, text, cursor: index }
    }
    default:
      return line
  }
}

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
export function matchCommands(commands: readonly CommandDef[], text: string): CommandDef[] {
  const needle = text.trim().toLowerCase()
  if (needle === '') return []
  const matches: CommandDef[] = []
  for (const command of commands) {
    const body = command.body.toLowerCase()
    if (body.trim() === needle) continue
    if (body.includes(needle) || command.description.toLowerCase().includes(needle)) {
      matches.push(command)
      if (matches.length >= MAX_ITEMS) break
    }
  }
  return matches
}

/**
 * True when the text the caret sits behind is a *program's* question rather
 * than a shell prompt.
 *
 * The popup exists for command lines. A question a running program asks —
 * `[y/N]`, `(yes/no)`, `Continue?`, `Password:` — is not one, and a saved
 * command filled into it would be typed into that program instead. The Host's
 * foreground verdict already covers programs (see terminal.tsx), but it cannot
 * see a question asked by the shell's own `read`/`select` builtin, and a Host
 * that cannot inspect processes has no verdict to give at all; this reads the
 * one thing every such case has in common, the anchor text itself.
 *
 * Deliberately narrow: that anchor is a shell prompt for every legitimate
 * popup, so a pattern that fired on an ordinary prompt would switch completion
 * off wholesale.
 */
function interactivePrompt(prompt: string): boolean {
  const text = prompt.trimEnd()
  if (text === '') return false
  return (
    // An answer list at the end of the line: `[y/N]`, `(y/n)`, `[Y]`, `（y/n）`.
    /[\[(（]\s*[yYnN]\s*(?:\/\s*[yYnN]\s*)?[\])）]$/.test(text) ||
    /\byes\s*\/\s*no\b/i.test(text) ||
    /continue\?/i.test(text) ||
    /(?:password|passphrase|passcode)\s*[:：]?$/i.test(text) ||
    /(?:密码|口令|确认|继续)\s*[:：]?$/.test(text)
  )
}

/** The popup for a line, or null when there is nothing to show. */
function popupFor(commands: readonly CommandDef[], line: LineModel): PopupState | null {
  if (!line.trusted || line.text.trim() === '') return null
  if (interactivePrompt(line.promptText)) return null
  const items = matchCommands(commands, line.text)
  return items.length === 0 ? null : { items, selected: 0 }
}

/** The result of {@link stepKey}. */
export interface StepResult {
  readonly session: CompletionSession
  /** Bytes for the PTY; null when the popup consumed the keystroke. */
  readonly forward: string | null
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
export function stepKey(
  session: CompletionSession,
  data: string,
  commands: readonly CommandDef[],
): StepResult {
  let line = session.line
  let popup = line.trusted ? session.popup : null
  const key = classify(data)

  if (popup !== null && popup.items.length > 0) {
    if (key.kind === 'up' || key.kind === 'down') {
      const delta = key.kind === 'up' ? -1 : 1
      const selected = (popup.selected + delta + popup.items.length) % popup.items.length
      return { session: { line, popup: { items: popup.items, selected } }, forward: null }
    }
    if (key.kind === 'escape') {
      return { session: { line, popup: null }, forward: null }
    }
    if (key.kind === 'submit') {
      const body = popup.items[popup.selected]?.body
      if (body !== undefined) {
        const filled = fillLine(line, body)
        return { session: { line: filled.line, popup: null }, forward: filled.forward }
      }
    }
  }

  const before = line.text
  line = applyKey(line, key)
  if (!line.trusted) popup = null
  else if (line.text !== before) popup = popupFor(commands, line)
  else if (key.kind === 'other') popup = null
  return { session: { line, popup }, forward: data }
}

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
export function fillLine(line: LineModel, body: string): { forward: string; line: LineModel } {
  const forward = byte(5) + byte(127).repeat(line.text.length) + body
  return { forward, line: { ...line, text: body, cursor: body.length, trusted: true } }
}

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
export function anchorOf(line: LineModel, screen: ScreenState): CompletionAnchor | null {
  if (line.promptLen === null || screen.cols <= 0) return null
  const col = (line.promptLen + line.cursor) % screen.cols
  return { row: Math.min(screen.caretRow, Math.max(0, screen.rows - 1)), col }
}

/**
 * Reference equality for the fields the popup renders, so a keystroke that
 * changes nothing (typing with no popup open, for one) publishes no React
 * state at all and the View does not re-render.
 */
export function sameCompletionView(a: CompletionView | null, b: CompletionView | null): boolean {
  if (a === null || b === null) return a === b
  if (a.consoleId !== b.consoleId || a.selected !== b.selected) return false
  if (a.anchor.row !== b.anchor.row || a.anchor.col !== b.anchor.col) return false
  if (a.items.length !== b.items.length) return false
  for (let index = 0; index < a.items.length; index += 1) {
    if (a.items[index].id !== b.items[index].id) return false
  }
  return true
}
