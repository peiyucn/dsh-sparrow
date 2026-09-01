/**
 * dsh-archive-manage client half：sidebar footer 入口 + 归档弹窗。
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
    'dialog.trashDir': '回收站位置：',
    'dialog.copyHint': '点击复制完整路径',
    'dialog.copied': '已复制',
    'trash.hint': '回收站中的会话不再出现在 @ 列表。',
    'loading': '加载中…',
    'retry': '重试',
    'section.archived': '归档区（{count}）',
    'section.trash': '回收站（{count}）',
    'section.strays': '游离会话（{count}）',
    'stray.hint': '游离会话：不在任何工作区、也未归档，官方界面无法清理，@ 列表会一直显示。',
    'stray.blankBadge': '空白会话',
    'stray.ageDays': '{n} 天前',
    'stray.ageToday': '今天',
    'empty.archived': '暂无归档会话',
    'empty.trash': '回收站为空',
    'legacy.hint': '标「旧格式」的条目来自更早版本，缺少还原信息，仅可彻底删除。',
    'legacy.badge': '旧格式',
    'legacy.restoreTitle': '旧格式条目缺少还原信息，无法还原',
    'action.trash': '移入回收站',
    'action.deletePermanently': '彻底删除',
    'action.restore': '还原',
    'action.restoreAll': '全部还原（{count}）',
    'action.deleteAll': '全部彻底删除',
    'state.running': '运行中',
    'state.unreleased': '未释放',
    'state.unreleasedActionHint': '该会话未被 dsh 进程释放，运行期间无法安全移动其文件：只能在下次启动 dsh 后移入回收站/彻底删除',
    'state.backendUnsupported': '后端不支持文件级操作',
    'group.unreleased': '未释放（{count}）',
    'confirm.trash': '将会话「{name}」移入回收站？\n\n移入后 @ / 侧边栏不再出现；可随时从回收站还原。',
    'confirm.delete': '此操作不可逆！\n\n请输入完整会话标题「{name}」以确认彻底删除：',
    'confirm.deleteStrayBlank': '彻底删除空白会话「{name}」？\n\n此操作不可逆。该会话 0 轮、没有任何内容。',
    'confirm.deleteMismatch': '彻底删除确认失败：输入的标题不一致',
    'confirm.deleteTrashItem': '彻底删除「{name}」？\n\n此操作不可逆，回收站条目将被永久移除。',
    'confirm.restoreAll': '还原全部回收站条目？\n\n将还原 {count} 个可还原条目。',
    'confirm.restoreAll.withLegacy': '还原全部回收站条目？\n\n将还原 {count} 个可还原条目，跳过 {legacy} 个旧格式条目。',
    'confirm.deleteAll': '此操作不可逆！将彻底删除回收站全部 {count} 个条目。\n\n请输入「{phrase}」以确认：',
    'confirm.deleteAllPhrase': '彻底删除全部',
    'confirm.deleteAllMismatch': '彻底删除确认失败：请输入「{phrase}」',
    'confirm.cancel': '取消',
    'confirm.deleting': '正在彻底删除…',
    'confirm.movingToTrash': '正在移入回收站…',
    'confirm.restoring': '正在还原…',
    'notice.skippedLegacy': '跳过旧格式 {count} 个',
    'notice.failed': '失败 {count} 个',
  },
  en: {
    'button.label': 'Archive',
    'dialog.title': 'Archived Sessions',
    'dialog.close': 'Close',
    'dialog.trashDir': 'Trash: ',
    'dialog.copyHint': 'Click to copy the full path',
    'dialog.copied': 'Copied',
    'trash.hint': 'Sessions in the trash no longer appear in the @ list.',
    'loading': 'Loading…',
    'retry': 'Retry',
    'section.archived': 'Archive ({count})',
    'section.trash': 'Trash ({count})',
    'section.strays': 'Stray sessions ({count})',
    'stray.hint': 'Stray sessions: not in any workspace and not archived; the official UI cannot clean them, and @ keeps showing them.',
    'stray.blankBadge': 'blank',
    'stray.ageDays': '{n} days ago',
    'stray.ageToday': 'today',
    'empty.archived': 'No archived sessions',
    'empty.trash': 'Trash is empty',
    'legacy.hint': 'Entries marked "Legacy" come from an earlier version and cannot be restored; they can only be deleted permanently.',
    'legacy.badge': 'Legacy',
    'legacy.restoreTitle': 'Legacy entry has no restore info',
    'action.trash': 'Move to trash',
    'action.deletePermanently': 'Delete permanently',
    'action.restore': 'Restore',
    'action.restoreAll': 'Restore all ({count})',
    'action.deleteAll': 'Delete all permanently',
    'state.running': 'Running',
    'state.unreleased': 'Held by dsh',
    'state.unreleasedActionHint': 'This session is still held by the dsh process and its files cannot be moved safely during this run: move it to trash or delete it after the next dsh startup',
    'state.backendUnsupported': 'Backend does not support file operations',
    'group.unreleased': 'Held by dsh ({count})',
    'confirm.trash': 'Move "{name}" to trash?\n\nIt disappears from @ / the sidebar; restore anytime from Trash.',
    'confirm.delete': 'This cannot be undone!\n\nType the full session title "{name}" to confirm permanent deletion:',
    'confirm.deleteStrayBlank': 'Delete blank session "{name}"?\n\nThis cannot be undone. The session has 0 turns and no content.',
    'confirm.deleteMismatch': 'Delete failed: the title does not match',
    'confirm.deleteTrashItem': 'Delete "{name}" permanently?\n\nThis cannot be undone; the entry will be removed forever.',
    'confirm.restoreAll': 'Restore all trash entries?\n\nWill restore {count} restorable entries.',
    'confirm.restoreAll.withLegacy': 'Restore all trash entries?\n\nWill restore {count} restorable entries, skipping {legacy} legacy.',
    'confirm.deleteAll': 'This cannot be undone! All {count} trash entries will be deleted permanently.\n\nType "{phrase}" to confirm:',
    'confirm.deleteAllPhrase': 'DELETE ALL',
    'confirm.deleteAllMismatch': 'Delete failed: type "{phrase}"',
    'confirm.cancel': 'Cancel',
    'confirm.deleting': 'Deleting permanently…',
    'confirm.movingToTrash': 'Moving to trash…',
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
  const disposeDictionaries = ctx.locale.register('archive-manage', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-archive-manage: locale dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    locale: 'archive-manage',
    id: 'archive-manage',
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
      }>('/api/archive-manage/list'),
      listStrays: () => readApi<{
        sessionId: string
        title: string
        createdAt: number
        blank: boolean
        live: boolean
        running: boolean
        backendSupported: boolean
      }>('/api/archive-manage/strays'),
      listTrashItems: () => readApi<{
        trashId: string
        sessionId: string
        title: string
        archivedAt: string
        legacy: boolean
      }>('/api/archive-manage/trash'),
      trashDirPath: async () => {
        const response = await fetch('/api/archive-manage/trash-dir')
        const payload = await response.json() as { path?: string; displayPath?: string; warning?: string; error?: { message?: string } }
        if (!response.ok) {
          throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
        }
        return { path: payload.path ?? '', displayPath: payload.displayPath ?? payload.path ?? '', warning: payload.warning }
      },
      moveToTrash: (sessionId: string) => postApi('/api/archive-manage/trash', { sessionId, confirm: true }),
      deleteSession: (sessionId: string, confirmTitle: string, simple: boolean) => postApi('/api/archive-manage/delete', simple ? { sessionId, confirm: true } : { sessionId, confirmTitle }),
      restoreTrashItem: (trashId: string) => postApi('/api/archive-manage/restore', { trashId }),
      deleteTrashItem: (trashId: string) => postApi('/api/archive-manage/trash-delete', { trashId, confirm: true }),
      restoreAllTrash: () => postApi<{ restored?: string[]; skippedLegacy?: number; failed?: Array<{ trashId: string; message: string }> }>('/api/archive-manage/trash-restore-all', { confirm: true }),
      deleteAllTrash: () => postApi<{ deleted?: number; failed?: string[] }>('/api/archive-manage/trash-delete-all', { confirm: true }),
    }),
  }, ArchiveDock))
}

export { ArchiveDock, ensureArchiveStyles } from './ArchiveDock.js'
export type { ArchiveDockInjected, ArchiveDockProps, ArchivedSessionItem, TrashItem } from './ArchiveDock.js'
