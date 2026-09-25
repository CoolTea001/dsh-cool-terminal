/**
 * Terminal-group model for the terminal tab.
 *
 * The Workspace list itself belongs to the Host and is read live from the
 * Client `workspaces` service (see {@link createWorkspaceBridge}); this module
 * owns only the part the Host does not know about: which named consoles each
 * Workspace group holds, their titles, and the tiny account persisted across
 * page reloads. Every list operation is pure so the React half can treat the
 * account as immutable state.
 */

/** One named console inside a Workspace (or session) group. */
export interface TerminalDef {
  readonly id: string
  readonly title: string
}

/** Console lists keyed by Workspace id, plus the session fallback key. */
export type TerminalAccount = Readonly<Record<string, readonly TerminalDef[]>>

/** Group key of the pseudo console bound to the session's own workdir. */
export const SESSION_KEY = '__session__'

/**
 * One persisted account is enough: ids inside it are globally unique.
 *
 * v3 is a clean break from the earlier format, which seeded a `Default`
 * console into every group; groups now start empty and the user creates what
 * they need.
 */
const STORAGE_KEY = 'dsh-cool-terminal.terminals.v3'

/** Expanded group keys, in the sidebar's order of expansion. */
const EXPANDED_KEY = 'dsh-cool-terminal.expanded.v1'

/** The console the tab last showed. */
const SELECTION_KEY = 'dsh-cool-terminal.selection.v1'

/** The active console: its group key plus the console id inside it. */
export interface TerminalSelection {
  readonly key: string
  readonly terminalId: string
}

/** Monotone counter; combined with the clock so ids stay unique across resets. */
let sequence = 0

/**
 * Read a group's consoles. Groups start empty by design: nothing is seeded,
 * so an unknown group and an emptied group both answer `[]`.
 * @param account - current account.
 * @param key - group key.
 * @returns a fresh array the caller may replace.
 */
export function terminalsFor(account: TerminalAccount, key: string): TerminalDef[] {
  const list = account[key]
  return list === undefined ? [] : [...list]
}

/**
 * Replace one group's console list, leaving the other groups shared.
 * @param account - current account.
 * @param key - group key.
 * @param list - the group's next console list.
 * @returns the next account.
 */
export function withTerminalList(
  account: TerminalAccount,
  key: string,
  list: readonly TerminalDef[],
): TerminalAccount {
  return { ...account, [key]: list }
}

/** The auto-generated title shape, with its slot number. */
const AUTO_TITLE = /^Terminal (\d+)$/

/**
 * One past the highest number a group's auto-named consoles still hold.
 *
 * The number only ever grows, so deleting `Terminal 1` while `Terminal 2`
 * stands does not hand `Terminal 1` out again: the next console is
 * `Terminal 3`. Deriving the number from `list.length` instead would collide
 * after any deletion. A console renamed to anything else stops matching
 * {@link AUTO_TITLE} and no longer counts toward the highest.
 * @param list - current group list.
 * @returns one past the highest standing `Terminal N`, or 1 when there is none.
 */
function nextTerminalNumber(list: readonly TerminalDef[]): number {
  let highest = 0
  for (const terminal of list) {
    const match = AUTO_TITLE.exec(terminal.title)
    if (match !== null) highest = Math.max(highest, Number.parseInt(match[1], 10))
  }
  return highest + 1
}

/**
 * Append a console named with the next free number.
 * @param list - current group list.
 * @param key - group key.
 * @returns the next group list.
 */
export function addTerminal(list: readonly TerminalDef[], key: string): TerminalDef[] {
  sequence += 1
  const id = `${key}:t${Date.now().toString(36)}${sequence.toString(36)}`
  return [...list, { id, title: `Terminal ${nextTerminalNumber(list)}` }]
}

/**
 * Rename one console; blank input is ignored rather than stored.
 * @param list - current group list.
 * @param id - console to rename.
 * @param title - requested title.
 * @returns the next group list.
 */
export function renameTerminal(
  list: readonly TerminalDef[],
  id: string,
  title: string,
): TerminalDef[] {
  const trimmed = title.trim()
  if (trimmed === '') return [...list]
  return list.map(terminal => (terminal.id === id ? { ...terminal, title: trimmed } : terminal))
}

/**
 * Remove one console. Any console may go, including a group's last one: the
 * group then simply holds none until the user adds another.
 * @param list - current group list.
 * @param id - console to remove.
 * @returns the next group list.
 */
export function removeTerminal(list: readonly TerminalDef[], id: string): TerminalDef[] {
  const next = list.filter(terminal => terminal.id !== id)
  return next.length === list.length ? [...list] : next
}

/**
 * Move one console to another position inside its own group.
 *
 * Drag-and-drop only ever reorders within the group a console belongs to, so
 * this takes no group key: the caller hands in the one group's list. `toIndex`
 * is the position in the *current* list the console should land on — "before
 * the hovered row" is that row's index, "after" is its index plus one.
 * Out-of-range positions clamp; dropping a console onto its own slot is a
 * harmless no-op that still returns a fresh array.
 * @param list - current group list.
 * @param id - console to move.
 * @param toIndex - target position in the current list.
 * @returns the next group list.
 */
export function moveTerminal(
  list: readonly TerminalDef[],
  id: string,
  toIndex: number,
): TerminalDef[] {
  const from = list.findIndex((terminal) => terminal.id === id)
  if (from < 0) return [...list]
  const index = Math.max(0, Math.min(list.length - 1, toIndex))
  if (index === from) return [...list]
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(from < index ? index - 1 : index, 0, moved)
  return next
}

/** Parse one persisted console entry, or undefined when it is malformed. */
function parseTerminalDef(item: unknown): TerminalDef | undefined {
  if (item === null || typeof item !== 'object') return undefined
  const record = item as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return undefined
  const title = typeof record.title === 'string' && record.title !== '' ? record.title : 'Terminal'
  return { id: record.id, title }
}

/**
 * Read the persisted account, dropping anything that does not match the shape
 * (a hand-edited or older entry must not break the tab).
 * @returns the validated account, or an empty one.
 */
export function loadAccount(): TerminalAccount {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const account: Record<string, readonly TerminalDef[]> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      const list: TerminalDef[] = []
      for (const item of value) {
        const terminal = parseTerminalDef(item)
        if (terminal !== undefined) list.push(terminal)
      }
      // An empty list is kept as-is: it records "this group holds none",
      // which must survive a reload rather than being dropped.
      account[key] = list
    }
    return account
  } catch {
    return {}
  }
}

/**
 * Persist the account. Storage failures (quota, blocked third-party storage)
 * are not worth surfacing: the consoles keep working for this page's lifetime.
 * @param account - account to persist.
 */
export function saveAccount(account: TerminalAccount): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
  } catch {
    /* persistence is a convenience, never a precondition */
  }
}

/**
 * Read the persisted expanded group keys.
 *
 * Only expansion is stored: a group missing from the list is collapsed, which
 * makes "collapsed" the state every group starts in.
 * @returns the validated keys, or an empty list.
 */
export function loadExpanded(): string[] {
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((key): key is string => typeof key === 'string' && key !== '')
  } catch {
    return []
  }
}

/**
 * Persist the expanded group keys.
 * @param keys - group keys currently expanded.
 */
export function saveExpanded(keys: readonly string[]): void {
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...keys]))
  } catch {
    /* persistence is a convenience, never a precondition */
  }
}

/**
 * Read the persisted active console.
 *
 * This is what makes a reload reopen the console the user was last using
 * instead of the first console of the first group.
 * @returns the validated selection, or null when absent or malformed.
 */
export function loadSelection(): TerminalSelection | null {
  try {
    const raw = window.localStorage.getItem(SELECTION_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    if (typeof record.key !== 'string' || record.key === '') return null
    if (typeof record.terminalId !== 'string' || record.terminalId === '') return null
    return { key: record.key, terminalId: record.terminalId }
  } catch {
    return null
  }
}

/**
 * Persist the active console; an empty selection drops the entry, so a tab
 * with nothing selected does not resurrect a stale console.
 * @param selection - active console, or null.
 */
export function saveSelection(selection: TerminalSelection | null): void {
  try {
    if (selection === null) window.localStorage.removeItem(SELECTION_KEY)
    else window.localStorage.setItem(SELECTION_KEY, JSON.stringify(selection))
  } catch {
    /* persistence is a convenience, never a precondition */
  }
}

/** The Live Workspace row fields this UI reads. */
export interface WorkspaceRow {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
}

/** The part of a Workspace snapshot this UI reads. */
export interface WorkspaceSnapshotLike {
  readonly items: readonly WorkspaceRow[]
}

/**
 * The bare observable the Client `workspaces` service exposes as `.list`.
 * Declared structurally so this package needs no module dependency on the
 * controller package.
 */
export interface WorkspaceSourceLike {
  getSnapshot(): WorkspaceSnapshotLike
  subscribe(listener: () => void): () => void
}

/**
 * Late-bound subscription to the Workspace service.
 *
 * The terminal tab must exist even in a composition that never provides the
 * service, so the plugin attaches through a child fiber and this bridge holds
 * the service when it appears. `getSnapshot` always returns the same object
 * while nothing changed, which is what `useSyncExternalStore` requires.
 */
export interface WorkspaceBridge {
  attach(source: WorkspaceSourceLike): () => void
  subscribe(listener: () => void): () => void
  getSnapshot(): WorkspaceSnapshotLike
}

const EMPTY_SNAPSHOT: WorkspaceSnapshotLike = { items: [] }

/**
 * Create the late-bound Workspace bridge.
 *
 * The bridge owns the snapshot identity React needs: `useSyncExternalStore`
 * loops forever when `getSnapshot` answers a fresh object every call, and a
 * source is only obliged to be correct, not identity-stable. The cached
 * snapshot is refreshed exactly on attach and on a source notification.
 *
 * @returns a bridge safe to read before any service has attached.
 */
export function createWorkspaceBridge(): WorkspaceBridge {
  let source: WorkspaceSourceLike | undefined
  let detach: (() => void) | undefined
  let cached: WorkspaceSnapshotLike = EMPTY_SNAPSHOT
  const listeners = new Set<() => void>()

  const refresh = (): void => {
    if (source === undefined) {
      cached = EMPTY_SNAPSHOT
      return
    }
    try {
      cached = source.getSnapshot()
    } catch {
      /* a failing source keeps the last readable snapshot */
    }
  }

  return {
    attach(next: WorkspaceSourceLike): () => void {
      if (source === next) return () => {}
      detach?.()
      source = next
      refresh()
      detach = next.subscribe(() => {
        refresh()
        for (const listener of [...listeners]) listener()
      })
      for (const listener of [...listeners]) listener()
      return () => {
        if (source !== next) return
        detach?.()
        detach = undefined
        source = undefined
        refresh()
        for (const listener of [...listeners]) listener()
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot(): WorkspaceSnapshotLike {
      return cached
    },
  }
}
