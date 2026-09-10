/**
 * Package-owned stylesheet for the terminal tab.
 *
 * Colors read the active theme tokens, so the tab follows the appearance the
 * user selected (including third-party theme presets) instead of forcing a
 * fixed dark terminal look. The sidebar mirrors the shipped sidebar's row
 * rhythm (28px headers, 26px rows, 8px radii, hover/active tokens) so the two
 * surfaces read as one product.
 */

export const TERMINAL_CSS = [
  '.dsh-ct-root{display:flex;flex-direction:row;box-sizing:border-box;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.5}',

  // Sidebar
  '.dsh-ct-side{flex:none;display:flex;flex-direction:column;min-height:0;width:256px;box-sizing:border-box;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
  '.dsh-ct-side-list{flex:1;min-height:0;overflow:auto;padding:8px 6px 10px}',
  '.dsh-ct-empty{padding:16px 12px;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center}',

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
  // a glance; the row box and type size still match the header's.
  '.dsh-ct-terms{display:flex;flex-direction:column;gap:2px;padding:2px 0 4px 16px}',

  // Same box and type as `.dsh-ct-ws-head`: 32px tall, 12px/6px inset, 13px text.
  '.dsh-ct-term{display:flex;align-items:center;gap:6px;height:32px;padding:0 6px 0 12px;border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:13px;cursor:pointer}',
  '.dsh-ct-term:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.dsh-ct-term-active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
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
  // The menu's icon slot is 16px square (Menu.module.css .itemIcon), which
  // `.dsh-ct-svg` already matches.
  '.dsh-ct-menu-glyph{display:inline-flex}',
  // Inline rename edits in place: no field chrome, so only the caret and the
  // text reveal that the label became editable.
  '.dsh-ct-rename{flex:1;min-width:0;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;line-height:inherit;outline:0;caret-color:currentColor}',

  // Console pane
  '.dsh-ct-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}',
  '.dsh-ct-head{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}',
  '.dsh-ct-cwd{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsh-ct-btn{background:transparent;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);border-radius:6px;padding:2px 8px;font:inherit;cursor:pointer}',
  '.dsh-ct-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.dsh-ct-out{flex:1;min-height:0;overflow:auto;padding:10px 12px}',
  '.dsh-ct-line{white-space:pre-wrap;word-break:break-word;margin:0}',
  '.dsh-ct-cmd{color:var(--dsw-alias-brand-primary)}',
  '.dsh-ct-err{color:var(--dsw-alias-state-error-primary)}',
  '.dsh-ct-sys{color:var(--dsw-alias-label-secondary)}',
  '.dsh-ct-row{flex:none;display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l1);padding:8px 12px}',
  '.dsh-ct-prompt{color:var(--dsw-alias-state-success-primary)}',
  '.dsh-ct-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:inherit;font:inherit}',
  '.dsh-ct-input::placeholder{color:var(--dsw-alias-label-secondary)}',
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
  element.textContent = TERMINAL_CSS
  document.head.appendChild(element)
  return () => {
    element.remove()
  }
}
