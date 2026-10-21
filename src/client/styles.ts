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
  // The tab paints no surface of its own: it is a window onto whatever the app
  // has behind the View — the canvas colour, or a theme's wallpaper layer (the
  // background-image feature clears the canvas and expects plugin surfaces to
  // clear themselves). An opaque slab here would hide the image for the whole
  // tab, so the root stays transparent and nothing inside it — sidebar
  // included — puts a surface back.
  //
  // The shell inherits the app's UI font so the sidebar matches DSH's own
  // sidebar; the console itself is drawn by xterm from `--ds-font-family-code`
  // (see terminal.tsx `readCodeFont`), not from CSS, so it stays monospaced.
  '.dsh-ct-root{display:flex;flex-direction:row;box-sizing:border-box;width:100%;height:100%;min-height:0;overflow:hidden;background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,sans-serif);font-size:12.5px;line-height:1.5}',

  // Sidebar. A window too, not a surface: the column paints no background of
  // its own, so it rests on whatever is behind the View — the canvas colour,
  // or a theme's wallpaper layer — exactly like the console beside it. In the
  // light palette that changes nothing (layer-1 and bg-base are both #fff); in
  // the dark one layer-1 (#232324) sat a visible step above the canvas
  // (#151517), and presets can move either, so the column stops competing with
  // the background it is laid on. The hairline seam is what still separates the
  // two halves of the tab.
  '.dsh-ct-side{flex:none;display:flex;flex-direction:column;min-height:0;width:256px;box-sizing:border-box;border-right:1px solid var(--dsw-alias-border-l1);background:transparent}',
  // Edge fades: rows dissolve at whichever end hides more list, so the eye can
  // tell there is something above/below the fold.
  //
  // This used to be a veil painted over the scroller in the sidebar's own
  // surface colour. That only works while the column *is* a surface: over the
  // canvas — and over a wallpaper — such a veil is a coloured band sitting on
  // the list instead of dissolving it. So the fade is a mask on the scroller
  // itself: rows lose alpha toward the edge and whatever is behind them shows
  // through, the same way the console is a window. `mask-image` is not
  // interpolatable between two gradients, so the switch is instant rather than
  // the old 0.15s opacity easing; it is tied to real overflow, so it only ever
  // changes when the user scrolls past an edge.
  //
  //   - `mask-size` stops at the scrollbar gutter (`--dsh-ct-fade-right`, set
  //     by the edge-fade effect in terminal.tsx) so a classic scrollbar never
  //     fades out; `mask-repeat:no-repeat` keeps the gradient anchored left.
  //   - `#000` is the opaque mask and `#0000` its clear end — the shorthand the
  //     shipped sidebar uses for its own label mask.
  //   - `data-fade-top` / `data-fade-bottom` are written straight to the DOM by
  //     the edge-fade effect, so a list short enough to fit keeps an unmasked
  //     first row instead of fading into nothing.
  //
  // The wrapper stays: it carries those attributes and the gutter variable,
  // neither of which belongs on the scroller's own style.
  '.dsh-ct-side-list-wrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}',
  '.dsh-ct-side-list{flex:1;min-height:0;overflow:auto;padding:8px 6px 10px;mask-image:none;mask-repeat:no-repeat;mask-position:0 0;mask-size:calc(100% - var(--dsh-ct-fade-right,0px)) 100%}',
  '[data-fade-top] .dsh-ct-side-list{mask-image:linear-gradient(to bottom,#0000,#000 28px)}',
  '[data-fade-bottom] .dsh-ct-side-list{mask-image:linear-gradient(to top,#0000,#000 28px)}',
  '[data-fade-top][data-fade-bottom] .dsh-ct-side-list{mask-image:linear-gradient(to bottom,#0000,#000 28px,#000 calc(100% - 28px),#0000)}',
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
  // Edge fades, the same rhythm as the terminal sidebar but a veil rather than
  // a mask: this list sits on the dialog card's own opaque surface (layer-2 is
  // the Modal card background), so a gradient towards that surface is exactly
  // what "the rows dissolve into the card" looks like. Shown only while that
  // edge actually hides content. `--dsh-ct-fade-right` is the scrollbar gutter
  // set by the edge-fade effect, so a fade covers the content column and never
  // washes out the scrollbar. `pointer-events:none` keeps scrolling and row
  // clicks working where a fade covers a row.
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
  // Icon actions ride the shared `.dsh-ct-icon` seat; only Delete shifts color.
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
  // prints its own prompt (which already carries the directory). No background
  // either: xterm draws the terminal and is configured to paint transparently
  // (terminal.tsx `readTheme`), so a wallpaper runs behind the text exactly as
  // it does behind the trajectory view and behind the sidebar beside it.
  '.dsh-ct-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;background:transparent}',
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
  // get a black slab while text is being composed. The composition box is
  // transparent like the rest of the screen: an opaque fill would flash a slab
  // over a wallpaper for the whole time an IME candidate is open.
  '.dsh-ct-screen .xterm .composition-view{background:transparent;color:var(--dsw-alias-label-primary)}',

  // Inline completion popup: anchored to the caret inside the active console's
  // screen wrapper (terminal.tsx `renderCompletion`). The width is fixed, so
  // rows of different content never resize the card; `max-width` only guards
  // a pane narrower than the card. Row and footer heights are exactly the
  // ones completion.ts's flip math assumes (ROW_PX, FOOTER_PX), so once every
  // MAX_ITEMS row shows the popup's height stays under POPUP_MAX_PX (that
  // +12 = 8px vertical padding + 2px footer margin + 2px of slack for the
  // elevation stroke, a shadow that costs no layout — so the flip-above
  // decision only ever over-measures, never under-measures). The fixed width
  // mirrors POPUP_MAX_W, the width the anchor clamps its right edge against.
  //
  // Card chrome restates the shipped dropdown (primitives Menu.module.css +
  // MenuSurface.module.css), restated here rather than imported because those
  // rules ship as hashed CSS-module classes with no public contract:
  //   - radius-lg card (16px) over the translucent menu material
  //     (`--dsw-menu-surface-fill` + `--dsw-menu-backdrop-filter`), not an
  //     opaque layer-2 slab;
  //   - no border box: the hairline is the elevation stroke, so `border` does
  //     not add to the measured height;
  //   - `--dsw-elevation-prominent` (stroke + two soft shadow layers) instead
  //     of a hand-written drop shadow.
  '.dsh-ct-ac{position:absolute;z-index:5;box-sizing:border-box;width:420px;max-width:100%;display:flex;flex-direction:column;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsw-menu-backdrop-filter,none);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);font-family:var(--dsw-font-family,sans-serif)}',
  // The theme darkens the dropdown's elevation stroke to l3 on its own menu
  // material (`body[data-ds-dark-theme] [data-menu-material]`); this card is
  // that material, so it takes the same stroke there.
  'body[data-ds-dark-theme] .dsh-ct-ac{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3)}',
  // One suggestion stacks its two lines: the command on top, its description
  // below, so a long command gets the full row instead of squeezing the
  // description into a shared line. The 44px box is ROW_PX: taller than the
  // dropdown's own 34px min-height because two lines stack here, and
  // POPUP_MAX_PX prices exactly this height. The row radius is radius-md so
  // it sits concentric in the radius-lg card behind the 4px pad (16 − 4 = 12),
  // the relationship the dropdown relies on for its hover pill.
  '.dsh-ct-ac-row{display:flex;flex-direction:column;justify-content:center;gap:1px;height:44px;padding:0 8px;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}',
  // Deliberately no `.dsh-ct-ac-row:hover` rule: the pointer does not style
  // itself, it *joins the selection* — `onMouseMove` writes its row into the
  // popup's `selected` (terminal.tsx `hoverCompletion`) and that one index is
  // the only thing painted below. A second, CSS-owned `:hover` fill could
  // light a row the selection is not on (a popup rebuilt under a stationary
  // cursor after typing is the everyday case), and two rows would be active
  // at once. One mechanism, one active row.
  //
  // The active row — arrow keys or pointer, same paint: `interactive-bg-hover`,
  // the dropdown's own hover fill, so it reads exactly like a DSH menu row
  // under the cursor. The description steps up one label level so the whole
  // card reads as active.
  '.dsh-ct-ac-on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.dsh-ct-ac-on .dsh-ct-ac-desc{color:var(--dsw-alias-label-secondary)}',
  // The command renders in the code font — it is shell text, and it must read
  // as the thing that will land in the prompt, not as UI copy.
  '.dsh-ct-ac-body{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code),ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:18px}',
  '.dsh-ct-ac-desc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px}',
  // The keyboard hint closes the popup's height accounting: its 22px box is
  // FOOTER_PX, and the 12 POPUP_MAX_PX adds on top of the rows is the card's
  // 8px vertical padding + this footer's 2px top margin + 2px of slack (the
  // stroke ring is a shadow, so it costs no layout).
  // 0.5px l2, not 1px l1: the dropdown pins its own footer hairline on l2 for
  // the same reason — l1 is near-invisible against this surface.
  '.dsh-ct-ac-foot{display:flex;align-items:center;height:22px;margin-top:2px;padding:0 8px;border-top:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-dimmed);font-size:10.5px;user-select:none}',

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
