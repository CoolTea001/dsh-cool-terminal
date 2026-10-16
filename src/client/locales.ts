/**
 * Bilingual copy for the terminal tab.
 *
 * Every user-visible string this package owns is declared here and resolved
 * through the Client `locale` service, so the tab follows the GUI's language
 * switch instead of freezing the language it was first rendered in. The two
 * dictionaries are one key set — the Chinese half is typed against the English
 * one, which makes a key added on one side and forgotten on the other a
 * compile error rather than a key name shown to the user.
 */

/** The namespace these dictionaries occupy in the Client locale registry. */
export const NS = 'dsh-cool-terminal'

/** English copy: the key set's source of truth. */
export const en = {
  'view.tab': 'Terminal',
  'sidebar.session': 'Current session',
  'sidebar.empty': 'No workspaces',
  'sidebar.new': 'New terminal',
  'main.hint': 'Click ＋ on a workspace on the left to open a terminal',
  'terminal.untitled': 'Terminal',
  'terminal.autoTitle': 'Terminal {n}',
  'terminal.rename': 'Rename',
  'terminal.remove': 'Delete',
  'terminal.more': 'More actions',
  'terminal.ended': 'Ended',
  'terminal.exitCode': 'Exit code {code}',
  'terminal.signal': 'Signal {signal}',
  'terminal.unknown': 'Unknown error',
  'terminal.startFailed': 'Could not start the terminal: {detail}',
  'terminal.endedBanner': '[Terminal ended: {detail}]',
  'terminal.reason.outputFailed': 'the output stream failed',
  'commands.title': 'Commands',
  'commands.description': 'Click a command to type it into the active terminal, or use the inline actions to manage it.',
  'commands.search': 'Search',
  'commands.searchLabel': 'Search commands',
  'commands.add': 'Add command',
  'commands.bodyPlaceholder': 'Command, e.g. pnpm dev',
  'commands.descriptionPlaceholder': 'Description (optional)',
  'commands.noDescription': 'No description',
  'commands.empty': 'No saved commands yet — click "Add command" to create one',
  'commands.noMatch': 'No matching commands',
  'commands.insertHint': 'Insert into the active terminal',
  'commands.noActiveTerminal': 'No active terminal',
  'commands.edit': 'Edit',
  'commands.copy': 'Copy',
  'commands.remove': 'Delete',
  'commands.copied': 'Copied',
  'commands.cancel': 'Cancel',
  'commands.save': 'Save',
  'commands.close': 'Close',
  'completion.footer': '↑↓ select · Enter fill · Esc close',
} as const

/** Simplified Chinese copy; must cover every English key. */
export const zh: Record<keyof typeof en, string> = {
  'view.tab': '终端',
  'sidebar.session': '当前会话',
  'sidebar.empty': '暂无工作区',
  'sidebar.new': '新建终端',
  'main.hint': '请在左侧工作区点击 ＋ 新建一个终端',
  'terminal.untitled': '终端',
  'terminal.autoTitle': '终端 {n}',
  'terminal.rename': '重命名',
  'terminal.remove': '删除',
  'terminal.more': '更多操作',
  'terminal.ended': '已结束',
  'terminal.exitCode': '退出码 {code}',
  'terminal.signal': '信号 {signal}',
  'terminal.unknown': '未知错误',
  'terminal.startFailed': '无法启动终端：{detail}',
  'terminal.endedBanner': '［终端结束：{detail}］',
  'terminal.reason.outputFailed': '输出流已中断',
  'commands.title': '常用命令',
  'commands.description': '点击命令插入到当前终端，或使用行内操作管理。',
  'commands.search': '搜索',
  'commands.searchLabel': '搜索常用命令',
  'commands.add': '添加命令',
  'commands.bodyPlaceholder': '命令，如 pnpm dev',
  'commands.descriptionPlaceholder': '描述（可选）',
  'commands.noDescription': '暂无描述',
  'commands.empty': '暂无常用命令，点击「添加命令」创建',
  'commands.noMatch': '没有匹配的命令',
  'commands.insertHint': '插入到当前终端',
  'commands.noActiveTerminal': '当前没有激活的终端',
  'commands.edit': '编辑',
  'commands.copy': '复制',
  'commands.remove': '删除',
  'commands.copied': '已复制',
  'commands.cancel': '取消',
  'commands.save': '保存',
  'commands.close': '关闭',
  'completion.footer': '↑↓ 选择 · Enter 填充 · Esc 关闭',
}

/** One translatable key of this package. */
export type LocaleKey = keyof typeof en

/** Values substituted into a template's `{name}` placeholders. */
export type LocaleParams = Record<string, string | number>

/**
 * A bound translator.
 *
 * Reads the active dictionary at call time, so a function that holds one (a
 * stream handler, the tab-label thunk) speaks whatever language is in force
 * when it runs.
 */
export type Translate = (key: LocaleKey, params?: LocaleParams) => string

/**
 * The slice of the Client `locale` service this package uses.
 *
 * Declared structurally so this package needs no module dependency on the
 * locale package, the same way `WorkspaceSourceLike` stands in for the
 * Workspace controller.
 */
export interface LocaleServiceLike {
  /** Register a namespace's built-in dictionaries; returns their disposer. */
  register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void
  /** Bind a namespace to a translator that reads the active locale per call. */
  bind(ns: string): (key: string, params?: LocaleParams) => string
}

/** Substitute `{name}` placeholders, with the Client locale service's semantics. */
function fill(template: string, params?: LocaleParams): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** A translator backed by one dictionary, for a page with no locale service. */
function fromDictionary(dict: Record<LocaleKey, string>): Translate {
  return (key, params) => fill(dict[key] ?? key, params)
}

/**
 * The translator a composition without the locale service falls back to.
 *
 * It answers Chinese for a browser that asks for a `zh*` language and English
 * otherwise — the same two languages the service ships, resolved without it.
 */
export function browserTranslate(): Translate {
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages ?? []
  const chinese = languages.some((tag) => tag.toLowerCase().split('-')[0] === 'zh')
  return fromDictionary(chinese ? zh : en)
}

/**
 * A translator bound to the Client locale service.
 *
 * Interpolation is the service's own, so a parameter value is never substituted
 * a second time.
 */
export function serviceTranslate(locale: LocaleServiceLike): Translate {
  const bound = locale.bind(NS)
  return (key, params) => bound(key, params)
}
