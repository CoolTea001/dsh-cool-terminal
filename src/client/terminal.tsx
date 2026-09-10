/**
 * The terminal tab: a Workspace sidebar on the left and the active console on
 * the right.
 *
 * The sidebar mirrors the Host Workspace list through the Client `workspaces`
 * service, so creating, renaming, reordering, or deleting a Workspace in DSH's
 * own sidebar shows up here without a reload. Each group holds one or more
 * named consoles; the group's default console is the one every Workspace
 * starts with, and its commands run in that Workspace's directory.
 *
 * Scrollback and busy flags live in this closure keyed by console id, not in
 * React state, so switching Views still keeps what was printed; the closure
 * belongs to the plugin instance and dies with the plugin's fiber.
 */

import * as React from 'react'
import {
  IconEditOutline16,
  IconEllipsisOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { execCommand, fetchContext } from './api.js'
import {
  SESSION_KEY,
  addTerminal,
  loadAccount,
  loadExpanded,
  removeTerminal,
  renameTerminal,
  saveAccount,
  saveExpanded,
  terminalsFor,
  withTerminalList,
  type TerminalAccount,
  type TerminalDef,
  type WorkspaceBridge,
} from './terminals.js'

type LineKind = 'out' | 'cmd' | 'err' | 'sys'

interface Line {
  readonly text: string
  readonly kind: LineKind
}

/** One entry of the left sidebar: a Workspace, or the session fallback. */
interface GroupRow {
  readonly key: string
  readonly title: string
  readonly path: string
  readonly kind: 'workspace' | 'session'
}

/** Keep the scrollback bounded; this is a convenience view, not a log store. */
const MAX_LINES = 800

const h = React.createElement

function trimTail(text: string): string {
  let value = text
  while (value.length > 0) {
    const code = value.charCodeAt(value.length - 1)
    if (code === 10 || code === 13 || code === 32) value = value.slice(0, -1)
    else break
  }
  return value
}

/** Compare directory spellings that differ only by trailing separators. */
function normalizePath(value: string): string {
  if (value === '') return ''
  const trimmed = value.replace(/[\\/]+$/, '')
  return trimmed === '' ? value : trimmed
}

/** Shared geometry for the inline action icons. */
function iconFrame(children: React.ReactNode): React.ReactElement {
  return h('svg', {
    className: 'dsh-ct-svg',
    viewBox: '0 0 24 24',
    width: '1em',
    height: '1em',
    'aria-hidden': 'true',
    focusable: 'false',
  }, h('path', { key: 'frame', d: 'M0 0h24v24H0z', fill: 'none' }), children)
}

/** A console's leading mark. */
function iconTerminal(): React.ReactElement {
  return iconFrame(h('g', {
    key: 'terminal',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
  },
  h('path', { key: 'prompt', d: 'm7 11l2-2l-2-2m4 6h4' }),
  h('rect', { key: 'frame', width: 18, height: 18, x: 3, y: 3, rx: 2, ry: 2 }),
  ))
}

/** Delete a console (the menu's destructive row). */
function iconTrash(): React.ReactElement {
  return iconFrame(h('path', {
    key: 'trash',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  }))
}

/** Add a console. */
function iconPlus(): React.ReactElement {  return iconFrame(h('path', {
    key: 'plus',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M5 12h14m-7-7v14',
  }))
}

/**
 * Build the View component.
 * @param bridge - late-bound Workspace list source.
 * @returns the Conversation View component.
 */
export function createTerminalView(bridge: WorkspaceBridge): React.ComponentType<any> {
  const lines = new Map<string, Line[]>()
  const busy = new Set<string>()
  const opened = new Set<string>()

  function pushLine(id: string, text: string, kind: LineKind = 'out'): void {
    const list = lines.get(id) ?? []
    list.push({ text, kind })
    if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES)
    lines.set(id, list)
  }

  function TerminalView(props: any): React.ReactElement {
    const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : undefined
    const snapshot = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
    const [account, setAccount] = React.useState<TerminalAccount>(() => loadAccount())
    const [sessionCwd, setSessionCwd] = React.useState('')
    const [selection, setSelection] = React.useState<{ key: string; terminalId: string } | null>(null)
    const [draft, setDraft] = React.useState('')
    const [renamingId, setRenamingId] = React.useState<string | null>(null)
    const [renameDraft, setRenameDraft] = React.useState('')
    /** Console whose row overflow menu is open, if any. */
    const [menuId, setMenuId] = React.useState<string | null>(null)
    /** Trigger of the open menu; its rect anchors the portaled list. */
    const menuAnchor = React.useRef<HTMLButtonElement | null>(null)
    /** Groups the user expanded; anything absent is collapsed. */
    const [expanded, setExpanded] = React.useState<readonly string[]>(() => loadExpanded())
    const [, setVersion] = React.useState(0)
    const bump = (): void => setVersion((value) => value + 1)
    /** Escape unmounts the rename input, and the unmount fires blur; this
     *  keeps that blur from committing the abandoned draft. */
    const skipBlurCommit = React.useRef(false)

    // The sidebar's workspaces are live; the session's own directory is only
    // needed to decide whether it deserves a fallback group.
    React.useEffect(() => {
      let cancelled = false
      void fetchContext(sessionId).then((result) => {
        if (cancelled) return
        if (result.ok && typeof result.workdir === 'string' && result.workdir !== '') setSessionCwd(result.workdir)
      })
      return () => {
        cancelled = true
      }
    }, [sessionId])

    const rows = React.useMemo<GroupRow[]>(() => {
      const list: GroupRow[] = snapshot.items.map((workspace) => ({
        key: workspace.workspaceId,
        title: workspace.title,
        path: workspace.path,
        kind: 'workspace' as const,
      }))
      const cwd = normalizePath(sessionCwd)
      if (cwd !== '' && !list.some((row) => normalizePath(row.path) === cwd)) {
        list.unshift({ key: SESSION_KEY, title: '当前会话', path: cwd, kind: 'session' })
      }
      return list
    }, [snapshot, sessionCwd])

    const rowSignature = rows.map((row) => row.key).join('|')

    React.useEffect(() => {
      saveAccount(account)
    }, [account])

    React.useEffect(() => {
      saveExpanded(expanded)
    }, [expanded])

    // Keep a valid selection: prefer the Workspace the session lives in, and
    // skip groups the user has emptied.
    React.useEffect(() => {
      const stillValid = selection !== null
        && rows.some((row) => row.key === selection.key)
        && terminalsFor(account, selection.key).some((terminal) => terminal.id === selection.terminalId)
      if (stillValid) return
      const populated = rows.filter((row) => terminalsFor(account, row.key).length > 0)
      if (populated.length === 0) {
        if (selection !== null) setSelection(null)
        return
      }
      const cwd = normalizePath(sessionCwd)
      const target = populated.find((row) => row.kind === 'workspace' && normalizePath(row.path) === cwd) ?? populated[0]
      setSelection({ key: target.key, terminalId: terminalsFor(account, target.key)[0].id })
    }, [rowSignature, account, selection, sessionCwd, rows])

    const activeGroup = selection === null ? undefined : rows.find((row) => row.key === selection.key)
    const activeList = activeGroup === undefined ? [] : terminalsFor(account, activeGroup.key)
    const active = selection === null
      ? undefined
      : activeList.find((terminal) => terminal.id === selection.terminalId)

    // Open each console exactly once: its header goes into its own scrollback.
    React.useEffect(() => {
      if (active === undefined || activeGroup === undefined || opened.has(active.id)) return
      opened.add(active.id)
      pushLine(active.id, `终端 · ${active.title}`, 'sys')
      pushLine(active.id, `工作目录 ${activeGroup.path}`, 'sys')
      bump()
    }, [active, activeGroup])

    const select = (key: string, terminalId: string): void => setSelection({ key, terminalId })

    const run = (): void => {
      if (active === undefined || activeGroup === undefined) return
      const command = draft
      if (command.trim() === '' || busy.has(active.id)) return
      const terminalId = active.id
      const workspaceId = activeGroup.kind === 'workspace' ? activeGroup.key : undefined
      setDraft('')
      busy.add(terminalId)
      pushLine(terminalId, command, 'cmd')
      bump()
      void execCommand(command, sessionId, workspaceId)
        .then((result) => {
          if (result.ok) {
            const out = result.stdout ? trimTail(result.stdout) : ''
            const err = result.stderr ? trimTail(result.stderr) : ''
            if (out !== '') pushLine(terminalId, out, 'out')
            if (err !== '') pushLine(terminalId, err, 'err')
            if (out === '' && err === '') pushLine(terminalId, '(无输出)', 'sys')
            if (result.timedOut === true) pushLine(terminalId, '命令超时已被终止', 'err')
            else if (typeof result.exitCode === 'number' && result.exitCode !== 0) pushLine(terminalId, `退出码 ${result.exitCode}`, 'sys')
          } else {
            pushLine(terminalId, `错误: ${result.error ?? '未知错误'}`, 'err')
          }
        })
        .catch((error: unknown) => {
          pushLine(terminalId, `调用失败: ${error instanceof Error ? error.message : String(error)}`, 'err')
        })
        .then(() => {
          busy.delete(terminalId)
          bump()
        })
    }

    const addConsole = (key: string): void => {
      const list = addTerminal(terminalsFor(account, key), key)
      const created = list[list.length - 1]
      setAccount(withTerminalList(account, key, list))
      // The ＋ sits on the header, so it is reachable while collapsed: adding
      // must reveal what it created.
      setExpanded((current) => current.includes(key) ? current : [...current, key])
      if (created !== undefined) select(key, created.id)
    }

    const removeConsole = (key: string, id: string): void => {
      const current = terminalsFor(account, key)
      const next = removeTerminal(current, id)
      if (next.length === current.length) return
      setAccount(withTerminalList(account, key, next))
      lines.delete(id)
      busy.delete(id)
      opened.delete(id)
      // A group may end up with none; the selection effect picks the next
      // populated group (or clears the selection when there is none).
      if (selection?.terminalId === id) setSelection(null)
    }

    const commitRename = (key: string, id: string): void => {
      setRenamingId(null)
      setAccount(withTerminalList(account, key, renameTerminal(terminalsFor(account, key), id, renameDraft)))
    }

    const toggleExpanded = (key: string): void => {
      setMenuId(null)
      setExpanded((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
    }

    const toggleRename = (terminal: TerminalDef): void => {
      skipBlurCommit.current = false
      setRenameDraft(terminal.title)
      setRenamingId(terminal.id)
    }

    const renderConsole = (row: GroupRow, terminal: TerminalDef): React.ReactElement => {
      const isActive = selection?.terminalId === terminal.id
      const isRenaming = renamingId === terminal.id
      const children: React.ReactNode[] = [
        h('span', { key: 'icon', className: 'dsh-ct-term-icon' }, iconTerminal()),
      ]
      if (isRenaming) {
        children.push(h('input', {
          key: 'rename',
          className: 'dsh-ct-rename',
          value: renameDraft,
          autoFocus: true,
          spellCheck: false,
          onClick: (event: React.MouseEvent) => { event.stopPropagation() },
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setRenameDraft(event.target.value),
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === 'Enter') {
              skipBlurCommit.current = true
              commitRename(row.key, terminal.id)
            } else if (event.key === 'Escape') {
              skipBlurCommit.current = true
              setRenamingId(null)
            }
          },
          onBlur: () => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false
              return
            }
            commitRename(row.key, terminal.id)
          },
        }))
      } else {
        children.push(h('span', { key: 'title', className: 'dsh-ct-term-title' }, terminal.title))
      }
      if (!isRenaming) {
        // One overflow menu per row, driven by the shipped Menu primitive: it
        // portals out of the sidebar's scroll clip and owns outside-click,
        // Escape, and repositioning.
        const menuItems: MenuEntry[] = [
          { id: 'rename', label: '重命名', icon: h(IconEditOutline16, { key: 'icon' }) },
          {
            id: 'remove',
            label: '删除',
            icon: h('span', { key: 'icon', className: 'dsh-ct-menu-glyph' }, iconTrash()),
            danger: true,
          },
        ]
        children.push(h('span', { key: 'actions', className: 'dsh-ct-term-actions' },
          h(Menu, {
            key: 'menu',
            open: menuId === terminal.id,
            items: menuItems,
            portal: true,
            closeOnPointerLeave: true,
            align: 'start',
            // Anchor the list at the trigger's bottom-RIGHT corner: the
            // zero-width rect makes `align: start` hang the card off that
            // corner instead of the button's left edge.
            getAnchorRect: (): DOMRect | null => {
              const element = menuAnchor.current
              if (element === null) return null
              const rect = element.getBoundingClientRect()
              return new DOMRect(rect.right, rect.top, 0, rect.height)
            },
            onSelect: (id: string) => {
              setMenuId(null)
              if (id === 'rename') toggleRename(terminal)
              else if (id === 'remove') removeConsole(row.key, terminal.id)
            },
            onClose: () => setMenuId(null),
            anchor: h('button', {
              type: 'button',
              className: 'dsh-ct-icon',
              title: '更多操作',
              'aria-label': '更多操作',
              onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation()
                menuAnchor.current = event.currentTarget
                setMenuId((current) => (current === terminal.id ? null : terminal.id))
              },
            }, h(IconEllipsisOutline16)),
          }),
        ))
      }
      const menuOpen = menuId === terminal.id
      return h('div', {
        key: terminal.id,
        className: `dsh-ct-term${isActive ? ' dsh-ct-term-active' : ''}${menuOpen ? ' dsh-ct-term-menu-open' : ''}`,
        title: row.path,
        onClick: () => {
          if (isRenaming) return
          select(row.key, terminal.id)
        },
      }, children)
    }

    const renderGroup = (row: GroupRow): React.ReactElement => {
      const list = terminalsFor(account, row.key)
      const isCollapsed = !expanded.includes(row.key)
      const head = h('div', {
        key: 'head',
        className: 'dsh-ct-ws-head',
        title: row.path,
        onClick: () => toggleExpanded(row.key),
      },
      // The shipped sidebar swaps its folder for a hover arrow; here the
      // folder alone carries the state (open vs closed), so it is stable.
      h('span', { key: 'folder', className: 'dsh-ct-folder' }, h(isCollapsed ? IconFolderClose16 : IconFolderOpen16)),
      h('span', { key: 'title', className: 'dsh-ct-ws-title' }, row.title),
      h('button', {
        key: 'add',
        type: 'button',
        className: 'dsh-ct-icon dsh-ct-ws-add',
        title: '新建终端',
        onClick: (event: React.MouseEvent) => {
          event.stopPropagation()
          addConsole(row.key)
        },
      }, iconPlus()),
      )
      const children: React.ReactNode[] = [head]
      if (!isCollapsed && list.length > 0) {
        children.push(h('div', { key: 'terms', className: 'dsh-ct-terms' },
          list.map((terminal) => renderConsole(row, terminal))))
      }
      return h('div', { key: row.key, className: 'dsh-ct-ws' }, children)
    }

    const sidebar = h('aside', { key: 'side', className: 'dsh-ct-side' },
      h('div', { key: 'list', className: 'dsh-ct-side-list' },
        rows.length === 0
          ? h('div', { key: 'empty', className: 'dsh-ct-empty' }, '暂无工作区')
          : rows.map((row) => renderGroup(row))),
    )

    const activeLines = active === undefined ? [] : (lines.get(active.id) ?? [])
    const rendered = activeLines.map((line, index) =>
      h('div', { key: `line-${index}`, className: `dsh-ct-line dsh-ct-${line.kind}` }, line.text))

    const main = h('section', { key: 'main', className: 'dsh-ct-main' },
      h('div', { key: 'head', className: 'dsh-ct-head' },
        h('span', { key: 'cwd', className: 'dsh-ct-cwd' },
          active === undefined || activeGroup === undefined
            ? '终端'
            : `${activeGroup.title} · ${active.title} · ${activeGroup.path}`),
        active === undefined
          ? null
          : h('button', {
            key: 'clear',
            type: 'button',
            className: 'dsh-ct-btn',
            onClick: () => {
              lines.set(active.id, [])
              bump()
            },
          }, '清空'),
      ),
      h('div', {
        key: 'out',
        className: 'dsh-ct-out',
        ref: (element: HTMLDivElement | null): void => {
          if (element) element.scrollTop = element.scrollHeight
        },
      }, rendered),
      h('form', {
        key: 'row',
        className: 'dsh-ct-row',
        onSubmit: (event: React.FormEvent) => {
          event.preventDefault()
          run()
        },
      },
      h('span', { key: 'prompt', className: 'dsh-ct-prompt' }, '❯'),
      h('input', {
        key: 'input',
        className: 'dsh-ct-input',
        value: draft,
        spellCheck: false,
        autoComplete: 'off',
        disabled: active === undefined,
        placeholder: active === undefined
          ? '请先新建终端'
          : busy.has(active.id) ? '运行中…' : '输入命令并回车',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
      }),
      ),
    )

    return h('div', {
      className: 'dsh-ct-root',
      // The shell's full-bleed opt-in, the same hook ui-trajectory renders:
      // it drops the transcript width handles and hands this View the whole
      // area instead of the transcript's content column.
      'data-conversation-composer-overlay': '',
    }, sidebar, main)
  }

  return TerminalView
}
