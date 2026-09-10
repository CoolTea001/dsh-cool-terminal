/**
 * Client entry for dsh-cool-terminal.
 *
 * The Workspace controller is an OPTIONAL collaborator: the tab must keep
 * working in a composition that never provides it, so it is attached through a
 * child fiber (`ctx.inject`) instead of a hard `inject` entry on this plugin,
 * and it only feeds the sidebar its live workspace list.
 */

import { createTerminalView } from './terminal.js'
import { createWorkspaceBridge } from './terminals.js'
import { insertTerminalStyles } from './styles.js'

export const name = 'dsh-cool-terminal/client'

export const inject = ['slots']

export function apply(ctx: any) {
  const slots = ctx.get('slots')
  if (slots === undefined) return

  ctx.effect(() => insertTerminalStyles(), 'dsh-cool-terminal: styles')

  const bridge = createWorkspaceBridge()
  // Optional collaborator: a client runtime without `ctx.inject` keeps the tab
  // and simply shows no workspace groups.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['workspaces'], (workspaceCtx: any) => {
      const workspaces = workspaceCtx.get('workspaces')
      if (workspaces === undefined || workspaces.list === undefined) return
      workspaceCtx.effect(
        () => bridge.attach(workspaces.list),
        'dsh-cool-terminal: workspace subscription',
      )
    })
  }

  // `conversation.view` is a list slot, and a list slot sorts by `priority`
  // first and `order` second (packages/client/ui-slots, `entries()`).
  //
  // Do NOT pass `priority`: leaving it unset keeps the default 0, the rank the
  // shipped Chat (0) and Trajectory (10) entries carry. A dynamic plugin cannot
  // match this — the browser-half guard overwrites `priority` with a
  // page-allocated lower rank, which sorts it ahead of every shipped entry.
  //
  // `order: 11` places the tab immediately after Trajectory, making it third.
  //
  // The view owns real PTYs and xterm instances held outside React's tree, so
  // unloading this plugin (reload or HMR) closes every shell instead of
  // orphaning it.
  const { View, dispose } = createTerminalView(bridge)
  ctx.effect(() => () => dispose(), 'dsh-cool-terminal: terminal teardown')

  slots.inject('conversation.view', () =>
    slots.register({ name: 'conversation.view', id: 'cool-terminal', order: 11, label: '终端' }, View),
  )
}
