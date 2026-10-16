/**
 * The common-commands dialog.
 *
 * Opens from the sidebar footer's Commands button: a searchable list of saved
 * shell snippets, each row inserting its command into the active console's
 * input (no newline — Enter runs it). Rows are outlined cards with
 * always-visible icon actions (edit / copy / delete); copy success is reported
 * by a toast owned by the dialog, because the primitives export the
 * clipboard writer but keep their feedback hook private, and a Tooltip
 * bubble cannot guarantee to stay open across the async write.
 *
 * Adding and editing are inline: Add command (a primary button next to the
 * search field) inserts a form card at the top of the list, and editing a row
 * swaps that row for the same form. The modal stays a single layer — the
 * nested dialog is gone — so the layer's Escape handler is intercepted in the
 * capture phase while a form is open: Escape then cancels the form instead of
 * closing the whole dialog.
 *
 * The command list lives in the View's state (persisted by commands.ts) and
 * the copy's language arrives as `t`, exactly as every other string this
 * package renders: this component is controlled — it renders what it is handed
 * and reports changes upward.
 */

import * as React from 'react'
import { Button, Input, Modal, Toast, Tooltip, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconCopy, IconEdit, IconPlus, IconTrash } from './icons.js'
import { addCommand, filterCommands, removeCommand, updateCommand, type CommandDef } from './commands.js'
import type { Translate } from './locales.js'

const h = React.createElement

/** How long the copy toast stays before fading (shorter than the default 3s). */
const COPIED_MS = 1500

interface EditingState {
  /** Null while the form adds a new command; the id it replaces otherwise. */
  readonly id: string | null
  readonly body: string
  readonly description: string
}

interface CommandsDialogProps {
  /** Whether the dialog is showing (owner-controlled). */
  open: boolean
  readonly commands: readonly CommandDef[]
  /** Translator for every string this dialog renders. */
  readonly t: Translate
  /** Whether an active console can receive text right now. */
  insertable: boolean
  /** Replace the whole list after an add, edit, or delete. */
  onChange: (next: CommandDef[]) => void
  onClose: () => void
  /** Insert one command into the active console; false means none can take it. */
  insert: (body: string) => boolean
}

/**
 * One saved command: an outlined card with the snippet, its description, and
 * the always-visible icon actions. Clicking the card inserts the command into
 * the active console's input (no newline — Enter runs it).
 */
function CommandRow(props: {
  command: CommandDef
  t: Translate
  /** False when no active console can receive text. */
  insertable: boolean
  onInsert: (body: string) => void
  onEdit: (command: CommandDef) => void
  onCopy: () => void
  onRemove: (id: string) => void
}): React.ReactElement {
  const { command, t, insertable, onInsert, onEdit, onCopy, onRemove } = props
  // Icon actions ride the shared `.dsh-ct-icon` seat inside a Tooltip bubble
  // (the bubble replaces the native title, so there is no double tooltip).
  // Copy feedback is the toast owned by the dialog, not the bubble: the
  // bubble depends on a live hover lasting across the async clipboard write,
  // which is not something a row can guarantee.
  const action = (key: string, label: string, danger: boolean, onClick: (event: React.MouseEvent) => void, icon: React.ReactElement):
    React.ReactElement =>
    h(Tooltip, {
      key,
      label,
      side: 'top',
      children: h('button', {
        type: 'button',
        className: `dsh-ct-icon dsh-ct-cmd-icon${danger ? ' dsh-ct-cmd-danger' : ''}`,
        'aria-label': label,
        onClick: (event: React.MouseEvent) => {
          event.stopPropagation()
          onClick(event)
        },
      }, icon),
    })
  return h('div', {
    key: command.id,
    className: 'dsh-ct-cmd-row',
    title: insertable ? t('commands.insertHint') : t('commands.noActiveTerminal'),
    onClick: () => {
      onInsert(command.body)
    },
  },
    h('div', { key: 'main', className: 'dsh-ct-cmd-main' },
      h('span', { key: 'body', className: 'dsh-ct-cmd-body' }, command.body),
      command.description === ''
        ? h('span', { key: 'desc', className: 'dsh-ct-cmd-desc dsh-ct-cmd-desc-none' }, t('commands.noDescription'))
        : h('span', { key: 'desc', className: 'dsh-ct-cmd-desc' }, command.description),
    ),
    h('div', { key: 'actions', className: 'dsh-ct-cmd-actions' },
      action('edit', t('commands.edit'), false, () => onEdit(command), h(IconEdit, { key: 'edit' })),
      action('copy', t('commands.copy'), false, () => onCopy(), h(IconCopy, { key: 'copy' })),
      action('remove', t('commands.remove'), true, () => onRemove(command.id), h(IconTrash, { key: 'remove' })),
    ),
  )
}

/** The inline add/edit form: two inputs plus a right-aligned cancel / save row. */
function CommandForm(props: {
  editing: EditingState
  t: Translate
  onChange: (next: EditingState) => void
  onCancel: () => void
  onSave: () => void
}): React.ReactElement {
  const { editing, t, onChange, onCancel, onSave } = props
  const canSave = editing.body.trim() !== ''
  const commit = (): void => {
    if (canSave) onSave()
  }
  return h('div', { className: 'dsh-ct-cmd-edit' },
    h(Input, {
      className: 'dsh-ct-cmd-input',
      value: editing.body,
      placeholder: t('commands.bodyPlaceholder'),
      autoFocus: true,
      spellCheck: false,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ ...editing, body: event.target.value })
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') commit()
      },
    }),
    h(Input, {
      className: 'dsh-ct-cmd-input',
      value: editing.description,
      placeholder: t('commands.descriptionPlaceholder'),
      spellCheck: false,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ ...editing, description: event.target.value })
      },
    }),
    h('div', { key: 'actions', className: 'dsh-ct-cmd-edit-actions' },
      h(Button, { key: 'cancel', variant: 'outline', onClick: onCancel }, t('commands.cancel')),
      h(Button, {
        key: 'save',
        variant: 'primary',
        disabled: !canSave,
        onClick: commit,
      }, t('commands.save')),
    ),
  )
}

/** The controlled common-commands dialog; render it with `open` toggled by the footer button. */
export function CommandsDialog(props: CommandsDialogProps): React.ReactElement {
  const { open, commands, t, insertable, onChange, onClose, insert } = props
  const [query, setQuery] = React.useState('')
  const [editing, setEditing] = React.useState<EditingState | null>(null)
  /** The copy toast plus a stamp for the React key, so a fresh copy restarts
   *  the banner even mid-flight. */
  const [toast, setToast] = React.useState<{ text: string; stamp: number } | null>(null)
  /** The scrollable list, and the wrapper the edge fades are pinned to. */
  const listScroll = React.useRef<HTMLDivElement | null>(null)
  const listWrap = React.useRef<HTMLDivElement | null>(null)
  /** The dialog forgets the search and any open form when it closes. */
  React.useEffect(() => {
    if (open) return
    setQuery('')
    setEditing(null)
    setToast(null)
  }, [open])

  /**
   * Show each list edge fade only where the list really hides content, the
   * same pass the sidebar uses: attributes written straight to the wrapper
   * (no re-render), a scroll listener for the offset, a ResizeObserver for
   * box changes, and the scrollbar gutter recorded so a fade never washes
   * out the scrollbar. No dependency list: a row added, edited, or removed
   * arrives as a commit, and re-running is what re-reads the new heights.
   */
  React.useEffect(() => {
    const scroll = listScroll.current
    const wrap = listWrap.current
    if (scroll === null || wrap === null) return
    const update = (): void => {
      const overflow = scroll.scrollHeight - scroll.clientHeight > 1
      wrap.toggleAttribute('data-fade-top', overflow && scroll.scrollTop > 1)
      wrap.toggleAttribute(
        'data-fade-bottom',
        overflow && scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 1,
      )
      const gutter = `${scroll.offsetWidth - scroll.clientWidth}px`
      if (wrap.style.getPropertyValue('--dsh-ct-fade-right') !== gutter) {
        wrap.style.setProperty('--dsh-ct-fade-right', gutter)
      }
    }
    update()
    scroll.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(scroll)
    return () => {
      scroll.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  })

  /**
   * Copy one command to the clipboard. The toast is the success feedback:
   * the Tooltip bubble cannot guarantee to stay open across the async write,
   * and a quiet write would otherwise look like a dead button.
   */
  const onCopy = (body: string): void => {
    void writeClipboard(body).then((ok) => {
      if (ok) setToast({ text: t('commands.copied'), stamp: Date.now() })
    })
  }

  const visible = React.useMemo(() => filterCommands(commands, query), [commands, query])

  const save = (): void => {
    if (editing === null) return
    const next = editing.id === null
      ? addCommand(commands, editing.body, editing.description)
      : updateCommand(commands, editing.id, editing.body, editing.description)
    onChange([...next])
    setEditing(null)
  }

  const renderList = (): React.ReactElement => {
    /** The inline form in either of its slots: replacing a row, or the add
     *  card at the top of the list. The two sites differ only in the key. */
    const renderForm = (editing: EditingState, key: string): React.ReactElement =>
      h(CommandForm, {
        key,
        editing,
        t,
        onChange: setEditing,
        onCancel: () => setEditing(null),
        onSave: save,
      })
    const rows = visible.map((command) => {
      if (editing !== null && editing.id === command.id) {
        return renderForm(editing, `edit-${command.id}`)
      }
      return h(CommandRow, {
        key: command.id,
        command,
        t,
        insertable,
        onInsert: (body) => {
          if (insert(body)) onClose()
        },
        onEdit: (target) => setEditing({ id: target.id, body: target.body, description: target.description }),
        onCopy: () => onCopy(command.body),
        onRemove: (id) => onChange([...removeCommand(commands, id)]),
      })
    })
    const adding = editing !== null && editing.id === null
    if (adding) {
      rows.unshift(renderForm(editing, 'add-form'))
    }
    if (!adding && rows.length === 0) {
      return h('div', { key: 'empty', className: 'dsh-ct-cmd-empty' },
        commands.length === 0 ? t('commands.empty') : t('commands.noMatch'))
    }
    // Fades are siblings of the scroller, never children of it: they are
    // pinned to the visible box so the list slides under them, and they paint
    // over the rows only while the wrapper carries the matching data
    // attribute (see the edge-fade effect above). Empty spans — no layout.
    return h('div', { key: 'wrap', className: 'dsh-ct-cmd-list-wrap', ref: listWrap },
      h('div', { key: 'scroll', className: 'dsh-ct-cmd-list', ref: listScroll }, rows),
      h('span', { key: 'fade-top', className: 'dsh-ct-cmd-fade dsh-ct-cmd-fade-top', 'aria-hidden': 'true' }),
      h('span', { key: 'fade-bottom', className: 'dsh-ct-cmd-fade dsh-ct-cmd-fade-bottom', 'aria-hidden': 'true' }),
    )
  }

  return h(React.Fragment, null,
    h(Modal, {
      open,
      onClose,
      title: t('commands.title'),
      closeLabel: t('commands.close'),
      description: t('commands.description'),
      className: 'dsh-ct-cmd-dialog',
      contentClassName: 'dsh-ct-cmd-content',
      // The inline form owns Escape while it is open: cancel the form instead
      // of letting the layer close the whole dialog on the first Escape.
      onKeyDownCapture: (event: React.KeyboardEvent) => {
        if (editing !== null && event.key === 'Escape' && !event.shiftKey) {
          event.preventDefault()
          setEditing(null)
        }
      },
      children: [
        h('div', { key: 'toolbar', className: 'dsh-ct-cmd-toolbar' },
          h(Input, {
            key: 'search',
            className: 'dsh-ct-cmd-search',
            value: query,
            placeholder: t('commands.search'),
            'aria-label': t('commands.searchLabel'),
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
          }),
          h(Button, {
            key: 'add',
            variant: 'primary',
            icon: h(IconPlus, { key: 'plus' }),
            onClick: () => setEditing({ id: null, body: '', description: '' }),
          }, t('commands.add')),
        ),
        renderList(),
      ],
    }),
    // The copy toast: the Toast primitive portals itself to the page and
    // fades out on its own timer; `stamp` restarts it for a second copy.
    toast === null ? null : h(Toast, {
      key: toast.stamp,
      text: toast.text,
      tone: 'success',
      holdMs: COPIED_MS,
      onDone: () => setToast(null),
    }),
  )
}