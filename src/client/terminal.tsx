/**
 * The terminal tab: a Workspace sidebar on the left and the active console on
 * the right.
 *
 * The sidebar mirrors the Host Workspace list through the Client `workspaces`
 * service, so creating, renaming, reordering, or deleting a Workspace in DSH's
 * own sidebar shows up here without a reload. Each group holds one or more
 * named consoles; every console owns a real PTY on the Host and an xterm.js
 * instance in the browser, so its scrollback, current directory, running
 * command, and shell state all survive switching Views.
 *
 * Runtime objects live in this closure keyed by console id, not in React
 * state, so unmounting the View keeps every shell alive; the closure belongs to
 * the plugin instance and is disposed with the plugin's fiber.
 */

import * as React from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import {
  IconEditOutline16,
  IconEllipsisOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  closeTerminal,
  fetchContext,
  openTerminal,
  sendInput,
  sendSignal,
  streamUrl,
} from './api.js'
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

/** One entry of the left sidebar: a Workspace, or the session fallback. */
interface GroupRow {
  readonly key: string
  readonly title: string
  readonly path: string
  readonly kind: 'workspace' | 'session'
}

/**
 * Lifecycle of one console's PTY.
 *
 * - `pending`  — the screen exists but the shell has not been asked for yet.
 * - `starting` — `POST /open` is in flight.
 * - `live`     — the SSE stream is attached.
 * - `lost`     — the stream dropped and stopped reconnecting.
 * - `exited`   — the shell reported its own exit.
 * - `failed`   — the Host refused to allocate a terminal.
 */
type RuntimeStatus = 'pending' | 'starting' | 'live' | 'lost' | 'exited' | 'failed'

/** Everything one console owns outside React's tree. */
interface Runtime {
  readonly id: string
  readonly term: Terminal
  readonly fit: FitAddon
  /** Mounted screen element xterm currently lives in. */
  element: HTMLDivElement | undefined
  terminalId: string | undefined
  source: EventSource | undefined
  status: RuntimeStatus
  detail: string
  /** True while `POST /open` is outstanding, so it is requested exactly once. */
  opening: boolean
  /** Serializes keystrokes so they reach the PTY in the order they were typed. */
  writes: Promise<void>
  /** Consecutive SSE failures; a reconnecting EventSource resets it. */
  errors: number
}

/** Keep the scrollback bounded; this is a convenience view, not a log store. */
const SCROLLBACK = 5000

/** Stop retrying a severed stream after this many consecutive failures. */
const MAX_STREAM_ERRORS = 3

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

/** Decode one base64 SSE frame into bytes xterm can write directly. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * Build an xterm theme from the active appearance tokens.
 *
 * Read on creation and refreshed on every activation, so switching a theme
 * preset is picked up the next time the console is focused.
 */
function readTheme(): ITheme {
  let style: CSSStyleDeclaration
  try {
    style = getComputedStyle(document.documentElement)
  } catch {
    return {}
  }
  const token = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim()
    return value === '' ? fallback : value
  }
  const background = token('--dsw-alias-bg-base', '#1b1b1f')
  const foreground = token('--dsw-alias-label-primary', '#e6e6e6')
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: token('--dsw-alias-brand-primary', '#4c8dff'),
  }
}

/** Human-readable summary of a terminal exit. */
function describeExit(payload: { exitCode?: number | null; signal?: string | null }): string {
  if (typeof payload.signal === 'string' && payload.signal !== '') return `信号 ${payload.signal}`
  if (typeof payload.exitCode === 'number') {
    return payload.exitCode === 0 ? '已结束' : `退出码 ${payload.exitCode}`
  }
  return '已结束'
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
function iconPlus(): React.ReactElement {
  return iconFrame(h('path', {
    key: 'plus',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M5 12h14m-7-7v14',
  }))
}

/** The result of {@link createTerminalView}. */
export interface TerminalViewHandle {
  /** The Conversation View component to register into `conversation.view`. */
  readonly View: React.ComponentType<any>
  /** Close every PTY and dispose every xterm instance. */
  dispose(): void
}

/**
 * Build the View component and its teardown.
 * @param bridge - late-bound Workspace list source.
 * @returns the Conversation View component plus a plugin-lifetime disposer.
 */
export function createTerminalView(bridge: WorkspaceBridge): TerminalViewHandle {
  /** Live consoles; survives this View being unmounted. */
  const runtimes = new Map<string, Runtime>()
  /** Console ids whose screen element is mounted, in first-activation order. */
  const openIds: string[] = []
  /** Mounted screens, filled by ref callbacks. */
  const screens = new Map<string, HTMLDivElement>()

  function setStatus(runtime: Runtime, status: RuntimeStatus, detail = ''): void {
    runtime.status = status
    runtime.detail = detail
  }

  function createRuntime(id: string): Runtime {
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 12.5,
      lineHeight: 1.3,
      scrollback: SCROLLBACK,
      macOptionIsMeta: true,
      theme: readTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const runtime: Runtime = {
      id,
      term,
      fit,
      element: undefined,
      terminalId: undefined,
      source: undefined,
      status: 'pending',
      detail: '',
      opening: false,
      writes: Promise.resolve(),
      errors: 0,
    }
    // Every keystroke, including control characters such as Ctrl+C, goes to the
    // PTY verbatim; the shell echoes it, which is what puts the cursor inline
    // after the prompt instead of in a separate input row.
    term.onData((data: string) => {
      const terminalId = runtime.terminalId
      if (terminalId === undefined) return
      runtime.writes = runtime.writes
        .then(() => sendInput(terminalId, data))
        .then(() => undefined)
        .catch(() => undefined)
    })
    return runtime
  }

  function writeBanner(runtime: Runtime, text: string): void {
    runtime.term.write(`\r\n\x1b[2m${text}\x1b[0m\r\n`)
  }

  /** Attach (or re-attach) the SSE stream that carries a console's output. */
  function attachStream(runtime: Runtime, bump: () => void): void {
    const terminalId = runtime.terminalId
    if (terminalId === undefined) return
    runtime.source?.close()
    const source = new EventSource(streamUrl(terminalId))
    runtime.source = source
    runtime.errors = 0

    source.onmessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { d?: unknown }
        if (typeof payload.d === 'string') runtime.term.write(decodeBase64(payload.d))
      } catch {
        /* a malformed frame is not worth breaking the stream over */
      }
    }
    source.onopen = () => {
      runtime.errors = 0
      if (runtime.status === 'lost') {
        setStatus(runtime, 'live')
        bump()
      }
    }
    source.addEventListener('exit', (event: Event) => {
      let detail = '已结束'
      try {
        detail = describeExit(JSON.parse((event as MessageEvent).data) as { exitCode?: number | null; signal?: string | null })
      } catch {
        /* keep the default label */
      }
      setStatus(runtime, 'exited', detail)
      source.close()
      runtime.source = undefined
      bump()
    })
    source.onerror = () => {
      // `EventSource` reconnects on its own. A console the Host has already
      // forgotten answers 404 forever, so stop after a few consecutive misses.
      runtime.errors += 1
      if (runtime.errors >= MAX_STREAM_ERRORS) {
        source.close()
        runtime.source = undefined
        setStatus(runtime, 'lost')
        bump()
        return
      }
      if (runtime.status === 'live') {
        setStatus(runtime, 'lost')
        bump()
      }
    }
  }

  /**
   * Size the screen and ask the Host for a PTY, exactly once per console.
   *
   * The subprocess seam exposes no resize verb, so this measurement is the
   * size the shell lives at for its whole lifetime.
   */
  async function ensureStarted(
    runtime: Runtime,
    group: GroupRow,
    sessionId: string | undefined,
    bump: () => void,
  ): Promise<void> {
    if (runtime.terminalId !== undefined || runtime.opening) return
    runtime.opening = true
    setStatus(runtime, 'starting')
    bump()
    try {
      // A hidden or zero-sized screen cannot be measured; fit() then keeps the
      // current geometry rather than collapsing the terminal.
      try {
        runtime.fit.fit()
      } catch {
        /* measurement is best-effort */
      }
      const workspaceId = group.kind === 'workspace' ? group.key : undefined
      const result = await openTerminal(sessionId, workspaceId, runtime.term.cols, runtime.term.rows)
      if (result.terminalId === undefined || result.terminalId === '') {
        const detail = result.error ?? '未知错误'
        setStatus(runtime, 'failed', detail)
        writeBanner(runtime, `无法启动终端: ${trimTail(detail)}`)
        bump()
        return
      }
      runtime.terminalId = result.terminalId
      setStatus(runtime, 'live')
      attachStream(runtime, bump)
      bump()
    } finally {
      runtime.opening = false
    }
  }

  /** The status pill's label and tone for one console. */
  function statusOf(runtime: Runtime | undefined): { text: string; live: boolean } {
    if (runtime === undefined) return { text: '未启动', live: false }
    switch (runtime.status) {
      case 'pending': return { text: '准备中', live: false }
      case 'starting': return { text: '启动中', live: false }
      case 'live': return { text: '运行中', live: true }
      case 'lost': return { text: '已断开', live: false }
      case 'exited': return { text: runtime.detail === '' ? '已结束' : runtime.detail, live: false }
      case 'failed': return { text: '启动失败', live: false }
    }
  }

  function TerminalView(props: any): React.ReactElement {
    const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : undefined
    const snapshot = React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
    const [account, setAccount] = React.useState<TerminalAccount>(() => loadAccount())
    const [sessionCwd, setSessionCwd] = React.useState('')
    const [selection, setSelection] = React.useState<{ key: string; terminalId: string } | null>(null)
    const [renamingId, setRenamingId] = React.useState<string | null>(null)
    const [renameDraft, setRenameDraft] = React.useState('')
    /** Console whose row overflow menu is open, if any. */
    const [menuId, setMenuId] = React.useState<string | null>(null)
    /** Trigger of the open menu; its rect anchors the portaled list. */
    const menuAnchor = React.useRef<HTMLButtonElement | null>(null)
    /** Groups the user expanded; anything absent is collapsed. */
    const [expanded, setExpanded] = React.useState<readonly string[]>(() => loadExpanded())
    const [version, setVersion] = React.useState(0)
    const bump = React.useCallback((): void => setVersion((value) => value + 1), [])
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

    // Mark a console as opened the first time it becomes active. Its screen
    // then stays mounted even after the user switches away.
    React.useEffect(() => {
      if (active === undefined || openIds.includes(active.id)) return
      openIds.push(active.id)
      bump()
    }, [active, bump])

    // Create each opened console's xterm exactly once, and re-home it when the
    // View mounts again after the conversation shell swapped it out.
    React.useEffect(() => {
      for (const id of [...openIds]) {
        const element = screens.get(id)
        if (element === undefined) continue
        const runtime = runtimes.get(id)
        if (runtime === undefined) {
          const created = createRuntime(id)
          created.term.open(element)
          created.element = element
          runtimes.set(id, created)
          continue
        }
        if (runtime.element === element) continue
        const own = runtime.term.element
        if (own !== undefined && own !== null) element.appendChild(own)
        runtime.element = element
        runtime.term.refresh(0, Math.max(0, runtime.term.rows - 1))
      }
    })

    // Wire the active console: refresh its theme, size it, and start its shell
    // the first time it is shown.
    React.useEffect(() => {
      if (active === undefined || activeGroup === undefined) return
      const runtime = runtimes.get(active.id)
      if (runtime === undefined || runtime.element === undefined) return
      runtime.term.options.theme = readTheme()
      runtime.term.focus()
      void ensureStarted(runtime, activeGroup, sessionId, bump)
      // `version` is what re-runs this after the "mark opened" effect above
      // bumps it: the runtime this effect needs does not exist until the next
      // commit, so the first pass returns early and this pass starts the shell.
    }, [active, activeGroup, sessionId, version, bump])

    const select = (key: string, terminalId: string): void => setSelection({ key, terminalId })

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

      const runtime = runtimes.get(id)
      if (runtime !== undefined) {
        const terminalId = runtime.terminalId
        if (terminalId !== undefined) void closeTerminal(terminalId)
        runtime.source?.close()
        runtime.source = undefined
        runtime.term.dispose()
        runtimes.delete(id)
      }
      screens.delete(id)
      const openIndex = openIds.indexOf(id)
      if (openIndex >= 0) openIds.splice(openIndex, 1)
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
      const runtime = runtimes.get(terminal.id)
      const live = runtime?.status === 'live'
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
        className: `dsh-ct-term${isActive ? ' dsh-ct-term-active' : ''}${menuOpen ? ' dsh-ct-term-menu-open' : ''}${live ? ' dsh-ct-term-live' : ''}`,
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

    const activeRuntime = active === undefined ? undefined : runtimes.get(active.id)
    const status = statusOf(activeRuntime)

    // Every opened console keeps its screen mounted; only the active one is
    // visible, so switching consoles never tears down a live shell.
    const screenNodes = openIds.map((id) => h('div', {
      key: id,
      className: `dsh-ct-screen${active !== undefined && active.id === id ? ' dsh-ct-screen-active' : ''}`,
      ref: (element: HTMLDivElement | null): void => {
        if (element === null) screens.delete(id)
        else screens.set(id, element)
      },
    }))

    const main = h('section', { key: 'main', className: 'dsh-ct-main' },
      h('div', { key: 'head', className: 'dsh-ct-head' },
        h('span', { key: 'cwd', className: 'dsh-ct-cwd' },
          active === undefined || activeGroup === undefined
            ? '终端'
            : `${activeGroup.title} · ${active.title} · ${activeGroup.path}`),
        h('span', {
          key: 'status',
          className: `dsh-ct-status${status.live ? ' dsh-ct-status-live' : ' dsh-ct-status-dead'}`,
        }, status.text),
        h('button', {
          key: 'kill',
          type: 'button',
          className: 'dsh-ct-btn dsh-ct-btn-danger',
          disabled: activeRuntime?.terminalId === undefined || activeRuntime.status === 'exited',
          title: '向当前前台进程发送 Ctrl+C (SIGINT)',
          onClick: () => {
            if (activeRuntime?.terminalId === undefined || activeRuntime.status === 'exited') return
            void sendSignal(activeRuntime.terminalId, 'SIGINT')
            activeRuntime.term.focus()
          },
        }, '终止'),
        h('button', {
          key: 'clear',
          type: 'button',
          className: 'dsh-ct-btn',
          disabled: activeRuntime === undefined,
          onClick: () => {
            activeRuntime?.term.clear()
            activeRuntime?.term.focus()
          },
        }, '清空'),
      ),
      h('div', { key: 'out', className: 'dsh-ct-out' },
        screenNodes,
        openIds.length === 0
          ? h('div', { key: 'hint', className: 'dsh-ct-hint' }, '请在左侧工作区点击 ＋ 新建一个终端')
          : null),
    )

    return h('div', {
      className: 'dsh-ct-root',
      // The shell's full-bleed opt-in, the same hook ui-trajectory renders:
      // it drops the transcript width handles and hands this View the whole
      // area instead of the transcript's content column.
      'data-conversation-composer-overlay': '',
    }, sidebar, main)
  }

  return {
    View: TerminalView,
    dispose(): void {
      for (const runtime of runtimes.values()) {
        const terminalId = runtime.terminalId
        if (terminalId !== undefined) void closeTerminal(terminalId)
        runtime.source?.close()
        runtime.source = undefined
        runtime.term.dispose()
      }
      runtimes.clear()
      screens.clear()
      openIds.length = 0
    },
  }
}
