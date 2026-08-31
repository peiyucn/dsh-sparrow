/**
 * dsh-archive-session client half：sidebar footer 入口 + 归档弹窗。
 * 所有写操作都走 host 自有路由；客户端不直接碰文件。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ArchiveDock, ensureArchiveStyles } from './ArchiveDock.js'

export const inject = ['slots', 'locale']

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'button.label': '归档',
    'dialog.title': '归档会话管理',
    'dialog.close': '关闭',
    'dialog.backupDir': '备份位置：',
    'dialog.copyHint': '点击复制完整路径',
    'dialog.copied': '已复制',
    'backups.hint': '备份后的会话不再出现在 @ 列表。',
    'loading': '加载中…',
    'section.archived': '归档区（{count}）',
    'section.backups': '备份区（{count}）',
    'section.strays': '游离会话（{count}）',
    'stray.hint': '游离会话：不在任何工作区、也未归档，官方界面无法清理，@ 列表会一直显示。',
    'stray.blankBadge': '空白会话',
    'stray.ageDays': '{n} 天前',
    'stray.ageToday': '今天',
    'empty.archived': '暂无归档会话',
    'empty.backups': '暂无备份',
    'legacy.hint': '标「旧格式」的备份来自更早版本，缺少恢复信息，仅可删除。',
    'legacy.badge': '旧格式',
    'legacy.restoreTitle': '旧格式备份缺少恢复信息，无法恢复',
    'action.backup': '备份',
    'action.delete': '删除',
    'action.restore': '恢复',
    'action.restoreAll': '全部恢复（{count}）',
    'action.deleteAll': '全部删除',
    'state.running': '运行中',
    'state.unreleased': '未释放',
    'state.unreleasedActionHint': '该会话未被 dsh 进程释放，运行期间无法安全移动其文件：只能在下次启动 dsh 后备份/删除',
    'state.backendUnsupported': '后端不支持文件级操作',
    'group.unreleased': '未释放（{count}）',
    'confirm.backup': '备份会话「{name}」？\n\n备份后 @ / 侧边栏不再出现；可随时从备份区恢复。',
    'confirm.delete': '此操作不可逆！\n\n请输入完整会话标题「{name}」以确认删除：',
    'confirm.deleteStrayBlank': '删除空白会话「{name}」？\n\n此操作不可逆。该会话 0 轮、没有任何内容。',
    'confirm.deleteMismatch': '删除确认失败：输入的标题不一致',
    'confirm.deleteBackup': '删除备份「{name}」？\n\n此操作不可逆，备份内容将被移除。',
    'confirm.restoreAll': '恢复全部备份？\n\n将恢复 {count} 个可恢复备份。',
    'confirm.restoreAll.withLegacy': '恢复全部备份？\n\n将恢复 {count} 个可恢复备份，跳过 {legacy} 个旧格式备份。',
    'confirm.deleteAll': '此操作不可逆！将删除备份区全部 {count} 个备份。\n\n请输入「{phrase}」以确认：',
    'confirm.deleteAllPhrase': '删除全部备份',
    'confirm.deleteAllMismatch': '删除确认失败：请输入「{phrase}」',
    'confirm.cancel': '取消',
    'confirm.deleting': '正在删除…',
    'confirm.backingUp': '正在备份…',
    'confirm.restoring': '正在恢复…',
    'notice.skippedLegacy': '跳过旧格式 {count} 个',
    'notice.failed': '失败 {count} 个',
  },
  en: {
    'button.label': 'Archive',
    'dialog.title': 'Archived Sessions',
    'dialog.close': 'Close',
    'dialog.backupDir': 'Backups: ',
    'dialog.copyHint': 'Click to copy the full path',
    'dialog.copied': 'Copied',
    'backups.hint': 'Backed-up sessions no longer appear in the @ list.',
    'loading': 'Loading…',
    'section.archived': 'Archive ({count})',
    'section.backups': 'Backups ({count})',
    'section.strays': 'Stray sessions ({count})',
    'stray.hint': 'Stray sessions: not in any workspace and not archived; the official UI cannot clean them, and @ keeps showing them.',
    'stray.blankBadge': 'blank',
    'stray.ageDays': '{n} days ago',
    'stray.ageToday': 'today',
    'empty.archived': 'No archived sessions',
    'empty.backups': 'No backups',
    'legacy.hint': 'Legacy backups from an earlier version cannot be restored; they can only be deleted.',
    'legacy.badge': 'Legacy',
    'legacy.restoreTitle': 'Legacy backup has no restore info',
    'action.backup': 'Backup',
    'action.delete': 'Delete',
    'action.restore': 'Restore',
    'action.restoreAll': 'Restore all ({count})',
    'action.deleteAll': 'Delete all',
    'state.running': 'Running',
    'state.unreleased': 'Held by dsh',
    'state.unreleasedActionHint': 'This session is still held by the dsh process and its files cannot be moved safely during this run: back it up or delete it after the next dsh startup',
    'state.backendUnsupported': 'Backend does not support file operations',
    'group.unreleased': 'Held by dsh ({count})',
    'confirm.backup': 'Back up "{name}"?\n\nIt disappears from @ / the sidebar; restore anytime from Backups.',
    'confirm.delete': 'This cannot be undone!\n\nType the full session title "{name}" to confirm:',
    'confirm.deleteStrayBlank': 'Delete blank session "{name}"?\n\nThis cannot be undone. The session has 0 turns and no content.',
    'confirm.deleteMismatch': 'Delete failed: the title does not match',
    'confirm.deleteBackup': 'Delete backup "{name}"?\n\nThis cannot be undone.',
    'confirm.restoreAll': 'Restore all backups?\n\nWill restore {count} restorable backups.',
    'confirm.restoreAll.withLegacy': 'Restore all backups?\n\nWill restore {count} restorable backups, skipping {legacy} legacy.',
    'confirm.deleteAll': 'This cannot be undone! All {count} backups will be deleted.\n\nType "{phrase}" to confirm:',
    'confirm.deleteAllPhrase': 'DELETE ALL',
    'confirm.deleteAllMismatch': 'Delete failed: type "{phrase}"',
    'confirm.cancel': 'Cancel',
    'confirm.deleting': 'Deleting…',
    'confirm.backingUp': 'Backing up…',
    'confirm.restoring': 'Restoring…',
    'notice.skippedLegacy': 'skipped {count} legacy',
    'notice.failed': '{count} failed',
  },
} as const

interface ApiEnvelope<T> {
  readonly items?: T[]
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 面板请求超时：host 挂起时不让面板永久 loading（根 AGENTS 网络约定）。 */
const REQUEST_TIMEOUT_MS = 15_000

async function readApi<T>(path: string, init?: RequestInit): Promise<T[]> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const payload = await response.json() as ApiEnvelope<T>
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return payload.items ?? []
}

async function postApi<T = { ok?: boolean }>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return payload
}

/**
 * client half 入口：注册 sidebar footer action。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  ensureArchiveStyles()
  const disposeDictionaries = ctx.locale.register('archive-session', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-archive-session: locale dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    locale: 'archive-session',
    id: 'archive-session',
    order: 20,
    inject: () => ({
      listArchived: () => readApi<{
        sessionId: string
        title: string
        updatedAt: number
        live: boolean
        running: boolean
        backendSupported: boolean
        workspaceIds: readonly string[]
      }>('/api/archive-session/list'),
      listStrays: () => readApi<{
        sessionId: string
        title: string
        createdAt: number
        blank: boolean
        live: boolean
        running: boolean
        backendSupported: boolean
      }>('/api/archive-session/strays'),
      listBackups: () => readApi<{
        backupId: string
        sessionId: string
        title: string
        archivedAt: string
        legacy: boolean
      }>('/api/archive-session/backups'),
      backupDirPath: async () => {
        const response = await fetch('/api/archive-session/backup-dir')
        const payload = await response.json() as { path?: string; displayPath?: string; error?: { message?: string } }
        if (!response.ok) {
          throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
        }
        return { path: payload.path ?? '', displayPath: payload.displayPath ?? payload.path ?? '' }
      },
      backupSession: (sessionId: string) => postApi('/api/archive-session/backup', { sessionId, confirm: true }),
      deleteSession: (sessionId: string, confirmTitle: string, simple: boolean) => postApi('/api/archive-session/delete', simple ? { sessionId, confirm: true } : { sessionId, confirmTitle }),
      restoreBackup: (backupId: string) => postApi('/api/archive-session/restore', { backupId }),
      deleteBackup: (backupId: string) => postApi('/api/archive-session/backup-delete', { backupId, confirm: true }),
      restoreAllBackups: () => postApi<{ restored?: string[]; skippedLegacy?: number; failed?: Array<{ backupId: string; message: string }> }>('/api/archive-session/backup-restore-all', { confirm: true }),
      deleteAllBackups: () => postApi<{ deleted?: number; failed?: string[] }>('/api/archive-session/backup-delete-all', { confirm: true }),
    }),
  }, ArchiveDock))
}

export { ArchiveDock, ensureArchiveStyles } from './ArchiveDock.js'
export type { ArchiveDockInjected, ArchiveDockProps, ArchivedSessionItem, BackupItem } from './ArchiveDock.js'
