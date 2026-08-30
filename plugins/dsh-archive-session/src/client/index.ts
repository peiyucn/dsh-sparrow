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
    'dialog.intro': '备份可逆，删除不可逆；备份后 @ 列表将不再显示该会话。',
    'loading': '加载中…',
    'section.archived': '已轻归档（{count}）',
    'section.backups': '备份区（{count}）',
    'empty.archived': '暂无轻归档会话',
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
    'state.live': '已打开',
    'state.backendUnsupported': '后端不支持文件级操作',
    'confirm.backup': '备份会话「{name}」？\n\n备份后 @ / 侧边栏不再出现；可随时从备份区恢复。',
    'confirm.delete': '此操作不可逆！\n\n请输入完整会话标题「{name}」以确认删除：',
    'confirm.deleteMismatch': '删除确认失败：输入的标题不一致',
    'confirm.deleteBackup': '删除备份「{name}」？\n\n此操作不可逆，备份内容将被移除。',
    'confirm.restoreAll': '恢复全部备份？\n\n将恢复 {count} 个可恢复备份。',
    'confirm.restoreAll.withLegacy': '恢复全部备份？\n\n将恢复 {count} 个可恢复备份，跳过 {legacy} 个旧格式备份。',
    'confirm.deleteAll': '此操作不可逆！将删除备份区全部 {count} 个备份。\n\n请输入「{phrase}」以确认：',
    'confirm.deleteAllPhrase': '删除全部备份',
    'confirm.deleteAllMismatch': '删除确认失败：请输入「{phrase}」',
    'notice.restored': '已恢复 {count} 个',
    'notice.skippedLegacy': '跳过旧格式 {count} 个',
    'notice.failed': '失败 {count} 个',
    'notice.deleted': '已删除 {count} 个备份',
  },
  en: {
    'button.label': 'Archive',
    'dialog.title': 'Archived Sessions',
    'dialog.close': 'Close',
    'dialog.intro': 'Backup is reversible; delete is not. A backed-up session no longer appears in the @ list.',
    'loading': 'Loading…',
    'section.archived': 'Archived ({count})',
    'section.backups': 'Backups ({count})',
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
    'state.live': 'Open',
    'state.backendUnsupported': 'Backend does not support file operations',
    'confirm.backup': 'Back up "{name}"?\n\nIt disappears from @ / the sidebar; restore anytime from Backups.',
    'confirm.delete': 'This cannot be undone!\n\nType the full session title "{name}" to confirm:',
    'confirm.deleteMismatch': 'Delete failed: the title does not match',
    'confirm.deleteBackup': 'Delete backup "{name}"?\n\nThis cannot be undone.',
    'confirm.restoreAll': 'Restore all backups?\n\nWill restore {count} restorable backups.',
    'confirm.restoreAll.withLegacy': 'Restore all backups?\n\nWill restore {count} restorable backups, skipping {legacy} legacy.',
    'confirm.deleteAll': 'This cannot be undone! All {count} backups will be deleted.\n\nType "{phrase}" to confirm:',
    'confirm.deleteAllPhrase': 'DELETE ALL',
    'confirm.deleteAllMismatch': 'Delete failed: type "{phrase}"',
    'notice.restored': 'Restored {count}',
    'notice.skippedLegacy': 'skipped {count} legacy',
    'notice.failed': '{count} failed',
    'notice.deleted': 'Deleted {count} backups',
  },
} as const

interface ApiEnvelope<T> {
  readonly items?: T[]
  readonly error?: { readonly code?: string; readonly message?: string }
}

async function readApi<T>(path: string, init?: RequestInit): Promise<T[]> {
  const response = await fetch(path, init)
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
      listBackups: () => readApi<{
        backupId: string
        sessionId: string
        title: string
        archivedAt: string
        legacy: boolean
      }>('/api/archive-session/backups'),
      backupSession: (sessionId: string) => postApi('/api/archive-session/backup', { sessionId, confirm: true }),
      deleteSession: (sessionId: string, confirmTitle: string) => postApi('/api/archive-session/delete', { sessionId, confirmTitle }),
      restoreBackup: (backupId: string) => postApi('/api/archive-session/restore', { backupId }),
      deleteBackup: (backupId: string) => postApi('/api/archive-session/backup-delete', { backupId, confirm: true }),
      restoreAllBackups: () => postApi<{ restored?: string[]; skippedLegacy?: number; failed?: Array<{ backupId: string; message: string }> }>('/api/archive-session/backup-restore-all', { confirm: true }),
      deleteAllBackups: () => postApi<{ deleted?: number; failed?: string[] }>('/api/archive-session/backup-delete-all', { confirm: true }),
    }),
  }, ArchiveDock))
}

export { ArchiveDock, ensureArchiveStyles } from './ArchiveDock.js'
export type { ArchiveDockInjected, ArchiveDockProps, ArchivedSessionItem, BackupItem } from './ArchiveDock.js'
