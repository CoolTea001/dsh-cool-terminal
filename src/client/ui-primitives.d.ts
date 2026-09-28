/**
 * Ambient shape of the platform-seeded primitives module.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is a module-table seed word the web
 * boot answers for every client bundle, so it is a runtime `require` this
 * package must not inline (see tsdown.config.ts). The package is not a build
 * dependency here, hence this local declaration: it covers exactly the exports
 * this plugin consumes, mirroring packages/client/ui-primitives/src/Menu.tsx.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, ReactPortal } from 'react'

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

  /** Visual variant, each backed by its `--dsw-alias-button-*` token family. */
  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'

  /** Props of the shared pressable button (the subset this plugin uses). */
  export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Visual family; `'ghost'` is the default. */
    variant?: ButtonVariant
    /** `'md'` 36px or `'sm'` 28px compact.
     */
    size?: 'md' | 'sm'
    /** Optional leading 16px icon node. */
    icon?: ReactNode
    className?: string | undefined
    children?: ReactNode
  }

  /** Render a button. */
  export function Button(props: ButtonProps): ReactElement

  /**
   * Render a centered dialog over a masked page. Escape, the mask, and the
   * header close button all call `onClose`; focus is trapped and restored.
   * `data-modal-autofocus` on any descendant takes the initial focus.
   */
  export interface ModalProps {
    open: boolean
    onClose: () => void
    /** Dialog heading; also the `aria-label`. */
    title: string
    /** Close-button accessible label (copy arrives via props). */
    closeLabel?: string
    /** Supporting sentence under the title. */
    description?: string
    children?: ReactNode
    /** Action row (Cancel / Save). */
    footer?: ReactNode
    className?: string
    /** Extra class for the scrollable content region. */
    contentClassName?: string
    /**
     * Capture-phase keydown on the dialog root. Runs before the layer's own
     * document listener, so a handler can `preventDefault()` an Escape to
     * cancel an inner state instead of closing the dialog.
     */
    onKeyDownCapture?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  }

  /** Render the dialog portal, or null when closed. */
  export function Modal(props: ModalProps): ReactPortal | null

  /** Props of the text input with an optional leading icon. */
  export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    /** Optional 16px leading icon node. */
    icon?: ReactNode
    className?: string | undefined
    /** Takes the dialog's initial focus (the Modal primitive looks it up). */
    'data-modal-autofocus'?: boolean | string
  }

  /** Render a text input: wrapper span + native input, attributes pass through. */
  export function Input(props: InputProps): ReactElement

  /** Bubble placement relative to the anchor. */
  export type TooltipSide = 'right' | 'bottom' | 'top'

  /**
   * Attach a hover/focus tooltip to an anchor element. The `label` prop is
   * read every render, so swapping it (e.g. to 已复制) updates an open bubble.
   * @param props.label - bubble text.
   * @param props.side - placement relative to the anchor (default 'right').
   * @param props.delayMs - hover delay; keyboard focus stays immediate.
   * @param props.disabled - suppress the bubble while true, without remounting
   * the anchor (which would cut its CSS transitions).
   * @param props.children - a single anchor element; its own ref is merged.
   */
  export function Tooltip(props: {
    label: string
    side?: TooltipSide
    delayMs?: number
    disabled?: boolean
    children: ReactElement
  }): ReactElement

  /**
   * A self-dismissing success banner, portaled to the page top-center. It
   * calls `onDone` after `holdMs` plus the fade, so the owner unmounts it
   * there; give it a changing `key` to restart a toast on a repeat event.
   */
  export interface ToastProps {
    /** Banner text. */
    text: string
    /** Success tone renders the check-glyph icon. */
    tone?: 'success'
    /** Any other leading icon (ignored while `tone === 'success'`). */
    icon?: ReactNode
    /** Anchor element whose horizontal center the banner tracks. */
    anchor?: HTMLElement | null
    /** Time to hold before the fade (default 3000ms). */
    holdMs?: number
    /** Optional trailing actions on the banner. */
    actions?: readonly { label: string; prefix?: ReactNode; onClick: () => void }[]
    /** Fired when the banner should unmount. */
    onDone?: () => void
  }

  /** Render the toast portal, or null when absent. */
  export function Toast(props: ToastProps): ReactPortal | null

  /**
   * Write `text` to the clipboard: the async clipboard API, falling back to a
   * hidden-textarea `execCommand('copy')`. Resolves false when both refuse.
   */
  export function writeClipboard(text: string): Promise<boolean>
}
