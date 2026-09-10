/**
 * Ambient shape of the platform-seeded primitives module.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is a module-table seed word the web
 * boot answers for every client bundle, so it is a runtime `require` this
 * package must not inline (see tsdown.config.ts). The package is not a build
 * dependency here, hence this local declaration: it covers exactly the exports
 * this plugin consumes, mirroring
 * packages/client/ui-primitives/src/Menu.tsx and src/icons/index.tsx.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /** Leading-icon props shared by the primitive icons. */
  export interface IconProps {
    size?: number
    className?: string | undefined
  }

  /** Selectable menu row, optionally with a nested submenu. */
  export interface MenuItem {
    id: string
    label: ReactNode
    disabled?: boolean
    icon?: ReactNode
    danger?: boolean
    submenu?: readonly MenuItem[]
  }

  /** Hairline between item groups. */
  export interface MenuSeparator {
    type: 'separator'
    id: string
  }

  /** Non-interactive heading row. */
  export interface MenuLabel {
    type: 'label'
    id: string
    text: string
  }

  /** One primary-menu entry. */
  export type MenuEntry = MenuItem | MenuSeparator | MenuLabel

  /** Anchored dropdown menu props (the subset this plugin uses). */
  export interface MenuProps {
    /** Whether the list is showing (owner-controlled). */
    open: boolean
    /** The trigger element, rendered in place. */
    anchor: ReactNode
    /** Selectable rows and optional separators. */
    items: readonly MenuEntry[]
    /** Row click callback; not called for disabled rows. */
    onSelect: (id: string) => void
    /** Invoked on outside click, Escape, or a window blur that left the document. */
    onClose: () => void
    /** List alignment against the anchor. */
    align?: 'start' | 'end'
    /** Open below (`bottom`, default) or above (`top`) the anchor. */
    side?: 'bottom' | 'top' | 'right'
    /** Render into `document.body` with fixed positioning, escaping ancestor clipping. */
    portal?: boolean
    /** Close once the pointer has left both trigger and list for the pointer grace. */
    closeOnPointerLeave?: boolean
    /**
     * Portal mode only: supply the anchor rect instead of measuring the
     * `Menu`'s own wrapper span. Called on open and on every scroll/resize;
     * return null to skip placement for that frame.
     */
    getAnchorRect?: () => DOMRect | null
    /** Focus the first item on open and enable arrow-key navigation. */
    autoFocus?: boolean
  }

  /** Render an anchored dropdown menu. */
  export function Menu(props: MenuProps): ReactElement | null

  /** Row overflow trigger glyph. */
  export function IconEllipsisOutline16(props: IconProps): ReactElement
  /** Rename glyph. */
  export function IconEditOutline16(props: IconProps): ReactElement
  /** Open-folder glyph (the sidebar's group marker when expanded). */
  export function IconFolderOpen16(props: IconProps): ReactElement
  /** Closed-folder glyph (the sidebar's group marker when collapsed). */
  export function IconFolderClose16(props: IconProps): ReactElement
}
