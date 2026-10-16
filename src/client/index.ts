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
import {
  NS,
  browserTranslate,
  en,
  serviceTranslate,
  zh,
  type LocaleServiceLike,
  type Translate,
} from './locales.js'

export const name = 'dsh-cool-terminal/client'

export const inject = ['slots']

export function apply(ctx: any) {
  const slots = ctx.get('slots')
  if (slots === undefined) return

  ctx.effect(() => insertTerminalStyles(), 'dsh-cool-terminal: styles')

  // The GUI's locale service owns the language switch, and it is an OPTIONAL
  // collaborator here exactly like the Workspace controller below: read rather
  // than hard-injected, so a composition that never provides it still opens the
  // tab in the browser's own language instead of dropping the tab entirely.
  //
  // Reading it is also what answers synchronously, and that answer decides
  // whether the slot entry below may name a locale namespace: the renderer
  // REFUSES an entry that declares one when no locale face is installed. An
  // unconditional `locale` would therefore turn a composition without the
  // service into a crashed View; conditional, the only cost in that
  // composition is that the outlet stops repainting on a language switch it
  // cannot perform anyway.
  let translate: Translate = browserTranslate()
  const locale: LocaleServiceLike | undefined = ctx.get('locale')
  if (locale !== undefined) {
    ctx.effect(() => locale.register(NS, { zh, en }), 'dsh-cool-terminal: dictionaries')
    translate = serviceTranslate(locale)
  } else if (typeof ctx.inject === 'function') {
    // A host that seats the locale service after this plugin: the dictionaries
    // and the binding still arrive, one activation later. The entry was
    // registered without a namespace by then, so this path translates without
    // the outlet's own locale subscription — the tab label, which the shell
    // re-reads through its thunk, still follows a switch.
    ctx.inject(['locale'], (localeCtx: any) => {
      const late: LocaleServiceLike | undefined = localeCtx.get('locale')
      if (late === undefined) return
      localeCtx.effect(() => late.register(NS, { zh, en }), 'dsh-cool-terminal: dictionaries')
      translate = serviceTranslate(late)
    })
  }

  // One stable translator over the live binding: the React half and every
  // out-of-tree callback (stream handlers, the failure banner) read the
  // language in force when they run, never the one installed at apply time.
  const t: Translate = (key, params) => translate(key, params)

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
  // The label is a thunk, not a string: the conversation shell re-reads it on
  // every locale change (`refreshViews` subscribes to the locale service), so
  // the tab renames itself in place when the user switches language.
  //
  // The view owns real PTYs and xterm instances held outside React's tree, so
  // unloading this plugin (reload or HMR) closes every shell instead of
  // orphaning it.
  const { View, dispose } = createTerminalView(bridge, t)
  ctx.effect(() => () => dispose(), 'dsh-cool-terminal: terminal teardown')

  const entry: Record<string, unknown> = {
    name: 'conversation.view',
    id: 'cool-terminal',
    order: 11,
    label: () => t('view.tab'),
  }
  // Naming the namespace is what subscribes this outlet to locale revisions,
  // so every string inside the tab repaints on a switch. Safe only because the
  // probe above saw the service that installs the face — see the comment there.
  if (locale !== undefined) entry.locale = NS

  slots.inject('conversation.view', () => slots.register(entry, View))
}
