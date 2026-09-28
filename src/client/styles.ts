/**
 * Package-owned stylesheet for the terminal tab.
 *
 * Colors read the active theme tokens, so the tab follows the appearance the
 * user selected (including third-party theme presets) instead of forcing a
 * fixed dark terminal look. The sidebar mirrors the shipped sidebar's row
 * rhythm (28px headers, 26px rows, 8px radii, hover/active tokens) so the two
 * surfaces read as one product.
 *
 * xterm's own stylesheet is inlined too; it arrives as a build-time `define`
 * (see tsdown.config.ts) because the platform module loader loads this package
 * as a single JS file and would never fetch a sibling `.css` asset.
 */

/**
 * xterm's stylesheet, substituted at build time. `typeof` keeps an unbundled
 * or misconfigured build from throwing at import time.
 */
declare const __DSH_CT_XTERM_CSS__: string

const XTERM_CSS = typeof __DSH_CT_XTERM_CSS__ === 'string' ? __DSH_CT_XTERM_CSS__ : ''

export const TERMINAL_CSS = [
  // The shell inherits the app's UI font so the sidebar matches DSH's own
  // sidebar; the console itself is drawn by xterm from `--ds-font-family-code`
  // (see terminal.tsx `readCodeFont`), not from CSS, so it stays monospaced.
  '.dsh-ct-root{display:flex;flex-direction:row;box-sizing:border-box;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,sans-serif);font-size:12.5px;line-height:1.5}',

  // Sidebar
  '.dsh-ct-side{flex:none;display:flex;flex-direction:column;min-height:0;width:256px;box-sizing:border-box;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
  // Edge fades: content dissolves into the sidebar's own surface at whichever
  // end hides more list, so the eye can tell there is something above/below
  // the fold without a dark band sitting on top of the rows.
  //
  // The scroll box is wrapped rather than being the positioned element itself:
  // an absolutely positioned child of the scroller scrolls away with the
  // content, so the fades have to be siblings of the list, pinned to the
  // wrapper's box, and painted after it — they cover the rows (a background on
  // the scroller could not: it paints underneath the content).
  //
  //   - `pointer-events:none` keeps scrolling, row clicks, and drag-and-drop
  //     working where a fade covers a row.
  //   - `opacity` is driven by `data-fade-top` / `data-fade-bottom`, written
  //     straight to the DOM by the edge-fade effect in terminal.tsx, so a fade
  //     only appears while that side really has hidden content: a list short
  //     enough to fit does not fade its first row into a grey smudge.
  //   - `--dsh-ct-fade-right` is the scrollbar gutter, set by the same effect,
  //     so the fade covers the content column and leaves the scrollbar alone.
  '.dsh-ct-side-list-wrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}',
  '.dsh-ct-side-list{flex:1;min-height:0;overflow:auto;padding:8px 6px 10px}',
  '.dsh-ct-fade{position:absolute;left:0;right:var(--dsh-ct-fade-right,0);height:28px;pointer-events:none;opacity:0;transition:opacity .15s ease;z-index:2}',
  '.dsh-ct-fade-top{top:0;background:linear-gradient(to bottom,var(--dsw-alias-bg-layer-1),rgba(0,0,0,0))}',
  '.dsh-ct-fade-bottom{bottom:0;background:linear-gradient(to top,var(--dsw-alias-bg-layer-1),rgba(0,0,0,0))}',
  '[data-fade-top] .dsh-ct-fade-top{opacity:1}',
  '[data-fade-bottom] .dsh-ct-fade-bottom{opacity:1}',
  '.dsh-ct-empty{padding:16px 12px;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center}',

  // Sidebar footer: the fixed bar under the scrolling workspace list. A
  // hairline separates it from the list without needing its own background —
  // it rests on the same surface as the rest of the column.
  '.dsh-ct-side-footer{flex:none;box-sizing:border-box;padding:4px 8px 10px 8px}',
  // Quick-action button in the shipped ghost style (the primitives Button
  // module's neutral variant, restated here so the plugin stays one CSS file):
  // transparent surface and primary label at rest, a translucent hover fill,
  // and the control-radius scale for the pill. Content sits flush left with
  // the same 12px inset as the workspace rows, so the icon column reads as one
  // line with the list above it.
  '.dsh-ct-ghost-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:flex-start;gap:6px;width:100%;height:44px;padding:0 12px;border:none;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;user-select:none}',
  '.dsh-ct-ghost-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-ct-ghost-btn:active{background:var(--dsw-alias-interactive-bg-active)}',
  // The shipped Button leaves the default focus ring; this restates it in the
  // product accent so it reads on both schemes instead of the UA's blue.
  '.dsh-ct-ghost-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',

  '.dsh-ct-ws{margin-bottom:4px}',
  '.dsh-ct-ws-head{display:flex;align-items:center;gap:6px;height:32px;padding:0 6px 0 12px;border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:13px;cursor:pointer;user-select:none}',
  '.dsh-ct-ws-head:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  // Group marker slot, matching the shipped sidebar's 16px `.slot` that holds
  // the folder glyph.
  '.dsh-ct-folder{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-tertiary)}',
  '.dsh-ct-ws-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}',
  // Reserved space, revealed on row hover or keyboard focus: the title must not
  // shift when the action appears.
  '.dsh-ct-ws-add{opacity:0;pointer-events:none;transition:opacity .1s ease}',
  '.dsh-ct-ws-head:hover .dsh-ct-ws-add,.dsh-ct-ws-head:focus-within .dsh-ct-ws-add{opacity:1;pointer-events:auto}',
  '.dsh-ct-icon.dsh-ct-ws-add{width:24px;height:24px}',
  // Child rows sit one step in from the group header, so the grouping reads at
  // a glance; the row box and type size still match the header's. The container
  // is the positioning parent of the drop line (see terminal.tsx `ROW_PITCH`).
  '.dsh-ct-terms{position:relative;display:flex;flex-direction:column;gap:2px;padding:2px 0 4px 16px}',

  // Same box and type as `.dsh-ct-ws-head`: 32px tall, 12px/6px inset, 13px text.
  // `user-select:none` keeps a press-then-move from starting a text selection
  // instead of the row's own drag; the row is also the positioning parent of
  // its drop mark.
  '.dsh-ct-term{position:relative;display:flex;align-items:center;gap:6px;height:32px;padding:0 6px 0 12px;border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:13px;cursor:pointer;user-select:none}',
  '.dsh-ct-term:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.dsh-ct-term-active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  // Drag-and-drop reorder, scoped to one workspace group's rows. The drop
  // line is a single element per group, absolutely positioned by insertion
  // index at whole row pitches (terminal.tsx `ROW_PITCH`): it always fills
  // exactly the 2px gap of the target slot, spans the row boxes, and — being
  // a child of the container rather than of a row — never inherits the
  // dragged row's fading, so it looks identical at every slot.
  '.dsh-ct-term-dragging{opacity:.4}',
  '.dsh-ct-drop-line{position:absolute;left:16px;right:0;height:2px;border-radius:1px;background:var(--dsw-alias-state-business-primary);pointer-events:none;z-index:1}',
  '.dsh-ct-term-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsh-ct-term-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-tertiary)}',
  '.dsh-ct-term:hover .dsh-ct-term-icon,.dsh-ct-term-active .dsh-ct-term-icon{color:var(--dsw-alias-label-primary)}',
  '.dsh-ct-term-actions{flex:none;display:none;align-items:center;gap:2px}',
  // The open menu keeps its trigger visible even after the pointer leaves, so
  // the hover affordance never disappears from under an open list.
  '.dsh-ct-term:hover .dsh-ct-term-actions,.dsh-ct-term-active .dsh-ct-term-actions,.dsh-ct-term-menu-open .dsh-ct-term-actions{display:inline-flex}',
  '.dsh-ct-svg{display:block;width:16px;height:16px}',
  '.dsh-ct-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:1;cursor:pointer}',
  // Row actions live inside an already-highlighted row, so hover only shifts
  // the color instead of stacking a second highlight on top of it.
  '.dsh-ct-icon:hover{color:var(--dsw-alias-label-primary)}',
  // Inline rename edits in place: no field chrome, so only the caret and the
  // text reveal that the label became editable.
  '.dsh-ct-rename{flex:1;min-width:0;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;line-height:inherit;outline:0;caret-color:currentColor}',

  // Common-commands dialog. The chrome (mask, card, header, footer) is the
  // shipped Modal primitive; these classes only dress the content handed to
  // it. The width override doubles its own class name: the primitives style
  // the card with a single-class rule (`width: min(380px, 100%)`), and the
  // doubled selector wins the tie without depending on stylesheet order —
  // the dialog portals to `document.body`, so nothing of `.dsh-ct-root`
  // scopes it.
  '.dsh-ct-cmd-dialog.dsh-ct-cmd-dialog{width:min(550px,100%)}',
  // The list scrolls inside the card; the toolbar and description stay fixed.
  '.dsh-ct-cmd-content{min-height:0;max-height:100%}',
  '.dsh-ct-cmd-toolbar{flex:none;display:flex;align-items:center;gap:8px;margin-bottom:8px}',
  '.dsh-ct-cmd-search{flex:1;min-width:0;height:36px}',
  // The scroller's wrapper pins the edge fades to the visible box: they are
  // positioned against it, not against the list (a child of the scroller
  // would scroll away with the content).
  '.dsh-ct-cmd-list-wrap{position:relative;display:flex;flex-direction:column;min-height:0}',
  '.dsh-ct-cmd-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;padding:8px 2px 8px 0;max-height:min(46vh,380px);overflow:auto}',
  // Edge fades, the same rhythm as the terminal sidebar: a gradient that
  // dissolves rows into the dialog card's own surface (layer-2 is the Modal
  // card background), shown only while that edge actually hides content.
  // `--dsh-ct-fade-right` is the scrollbar gutter set by the edge-fade
  // effect, so a fade covers the content column and never washes out the
  // scrollbar. `pointer-events:none` keeps scrolling and row clicks working
  // where a fade covers a row.
  '.dsh-ct-cmd-fade{position:absolute;left:0;right:var(--dsh-ct-fade-right,0);height:32px;pointer-events:none;opacity:0;transition:opacity .15s ease;z-index:2}',
  '.dsh-ct-cmd-fade-top{top:0;background:linear-gradient(to bottom,var(--dsw-alias-bg-layer-2),rgba(0,0,0,0))}',
  '.dsh-ct-cmd-fade-bottom{bottom:0;background:linear-gradient(to top,var(--dsw-alias-bg-layer-2),rgba(0,0,0,0))}',
  '[data-fade-top] .dsh-ct-cmd-fade-top{opacity:1}',
  '[data-fade-bottom] .dsh-ct-cmd-fade-bottom{opacity:1}',
  '.dsh-ct-cmd-empty{padding:24px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}',
  // One saved command: an outlined card with the snippet, its description,
  // and the always-visible icon actions. The borderless hover fill matches
  // the shipped outline button's hover (outline adds only the hairline, so a
  // hover must not rest on a second stroke).
  '.dsh-ct-cmd-row{position:relative;display:flex;align-items:center;gap:16px;padding:12px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}',
  '.dsh-ct-cmd-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-ct-cmd-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
  '.dsh-ct-cmd-body{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px}',
  '.dsh-ct-cmd-desc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
  // A missing description reads as a quieter placeholder instead of leaving
  // the row's second line empty.
  '.dsh-ct-cmd-desc-none{color:var(--dsw-alias-label-dimmed)}',
  // Icon actions ride the shared `.dsh-ct-icon` seat; only 删除 shifts color.
  '.dsh-ct-cmd-actions{flex:none;display:inline-flex;align-items:center;gap:4px}',
  // The shared icon seat is 20px — too thin to land on by touch or with a
  // cursor. The command-row actions widen the box to 28px (about twice the
  // area) while the glyph stays 16px centred, so the hover fill, focus ring,
  // and Tooltip hover band all grow with the tappable surface.
  '.dsh-ct-icon.dsh-ct-cmd-icon{width:28px;height:28px;border-radius:var(--dsw-radius-md)}',
  '.dsh-ct-icon.dsh-ct-cmd-danger:hover{color:var(--dsw-alias-state-error-primary)}',
  // The inline add/edit form: an outlined card like the command rows above
  // it, so adding reads as one more list entry awaiting its save. The
  // inputs fill the card; the actions sit right-aligned at the bottom.
  '.dsh-ct-cmd-edit{display:flex;flex-direction:column;gap:8px;padding:10px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md)}',
  '.dsh-ct-cmd-edit-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}',
  '.dsh-ct-cmd-input{height:36px}',

  // Console pane. There is no toolbar: the pane is the terminal, and the shell
  // prints its own prompt (which already carries the directory).
  '.dsh-ct-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-base)}',
  // Every opened console keeps its element mounted and its xterm instance
  // alive; only the active one is visible, so switching Views keeps scrollback
  // and the shell's own state exactly where they were.
  '.dsh-ct-out{position:relative;flex:1;min-height:0;overflow:hidden;padding:6px 8px 8px}',
  '.dsh-ct-screen{position:absolute;top:6px;left:8px;right:8px;bottom:8px;display:none}',
  '.dsh-ct-screen-active{display:block}',
  // xterm paints its own background from the theme object; the wrapper only
  // has to give it a definite box to measure.
  '.dsh-ct-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;padding:0 32px}',
  // xterm renders a hidden textarea for IME/paste; keep it from showing a
  // focus ring inside the pane.
  '.dsh-ct-screen .xterm{height:100%}',
  '.dsh-ct-screen .xterm .xterm-viewport{background:transparent!important;scrollbar-width:thin}',
  // xterm hardcodes black behind both the scrollbar track and the IME
  // composition box; repaint them from the theme so a light palette does not
  // get a black slab while text is being composed.
  '.dsh-ct-screen .xterm .composition-view{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',

  // The conversation shell keeps its composer seat mounted for every View. The
  // sanctioned overlay attribute (on the root below, the one ui-trajectory
  // uses) only turns that seat into a floating card over the View; this View
  // opts out of it entirely. Scoped by our own root class, so Chat and
  // Trajectory keep their composer untouched.
  '[data-conversation-scroll]:has(.dsh-ct-root)>[data-composer-seat]{display:none}',
].join('\n')

/**
 * Insert the stylesheet once for the plugin lifetime.
 *
 * @returns disposer that removes exactly this element.
 */
export function insertTerminalStyles(): () => void {
  const element = document.createElement('style')
  element.setAttribute('data-dsh-cool-terminal', '')
  element.textContent = XTERM_CSS === '' ? TERMINAL_CSS : `${XTERM_CSS}\n${TERMINAL_CSS}`
  document.head.appendChild(element)
  return () => {
    element.remove()
  }
}
