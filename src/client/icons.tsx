/**
 * The plugin's own icon set, rendered from the SVG artwork under
 * `src/client/assets/`. The client bundle is one JS file the platform's
 * module loader evaluates, so sibling asset files would never be fetched;
 * tsdown.config.ts inlines the artwork at build time as the `__DSH_CT_ICONS__`
 * string map this module consumes (keyed by asset filename stem).
 *
 * The artwork is 24-unit Feather-style stroke markup riding `currentColor`,
 * so every glyph tints with the surrounding CSS. `.dsh-ct-svg` keeps a glyph
 * on the 16px square the action buttons, the menu icon slot, and the sidebar
 * markers all expect; pass `className` to override that seat.
 */

import * as React from 'react'

const h = React.createElement

/** Build-time define from tsdown.config.ts: raw SVG text per asset stem. */
declare const __DSH_CT_ICONS__: Record<string, string>

/** Props shared by the plugin's icon components. */
export interface DshCtIconProps {
  /** Extra class for layout placement; defaults to the shared 16px seat. */
  className?: string | undefined
}

/** One asset's parsed artwork: root viewBox plus the markup inside `<svg>`. */
interface IconArtwork {
  readonly viewBox: string
  readonly inner: string
}

/** Parse one asset's raw SVG into the artwork its component renders. */
function iconArtwork(name: string): IconArtwork {
  const raw = __DSH_CT_ICONS__[name]
  if (raw === undefined) {
    throw new Error(`dsh-cool-terminal: missing icon asset '${name}.svg'`)
  }
  return {
    viewBox: /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 24 24',
    inner: /<svg[^>]*>([\s\S]*)<\/svg>/.exec(raw)?.[1] ?? '',
  }
}

/** Build one icon component from an asset's raw SVG markup. */
function svgIcon(name: string) {
  const { viewBox, inner } = iconArtwork(name)
  return ({ className }: DshCtIconProps): React.ReactElement =>
    h('svg', {
      className: className ?? 'dsh-ct-svg',
      viewBox,
      'aria-hidden': 'true',
      focusable: 'false',
      dangerouslySetInnerHTML: { __html: inner },
    })
}

/** A console's leading mark (assets/terminal.svg). */
export const IconTerminal = svgIcon('terminal')

/** Sidebar group marker when a Workspace is collapsed (assets/folder-closed.svg). */
export const IconFolderClosed = svgIcon('folder-closed')

/** Sidebar group marker when a Workspace is expanded (assets/folder-opened.svg). */
export const IconFolderOpened = svgIcon('folder-opened')

/** Row overflow trigger glyph (assets/more.svg). */
export const IconMore = svgIcon('more')

/** Add a console (assets/plus.svg). */
export const IconPlus = svgIcon('plus')

/** Rename a console (the menu's row glyph, assets/edit.svg). */
export const IconEdit = svgIcon('edit')

/** Delete a console (the menu's destructive row glyph, assets/trash.svg). */
export const IconTrash = svgIcon('trash')
