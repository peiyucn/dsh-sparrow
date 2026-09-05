/**
 * dsh-archive-manage client half：sidebar footer 入口 + 归档弹窗。
 * 所有写操作都走 host 自有路由；客户端不直接碰文件。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ArchiveDock, ensureArchiveStyles } from './ArchiveDock.js'
import type { ArchivedSessionItem, StraySessionItem } from './ArchiveDock.js'

// remote：官方 Remote 事件载体（api-session/* 桥接，spec 08 §2.5）；硬依赖，缺失时本插件客户端不启动。
export const inject = ['slots', 'locale', 'remote']

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
    'trash.uninstallHint': '卸载插件前请先还原或清空回收站；卸载后仅能通过重新安装继续操作。',
    'loading': '加载中…',
    'retry': '重试',
    'section.archived': '归档区（{count}）',
    'section.trash': '回收站（{count}）',
    'section.strays': '游离会话（{count}）',
    'stray.hint': '游离会话：不在任何工作区、也未归档，官方界面无法清理，@ 列表会一直显示。',
    'stray.blankBadge': '空白会话',
    'stray.orphanBadge': '孤儿子会话',
    'tree.childCount': '{n} 个子会话',
    'fact.turns': '{n} 轮',
    'stray.ageDays': '{n} 天前',
    'stray.ageToday': '今天',
    'empty.archived': '暂无归档会话',
    'empty.trash': '回收站为空',
    'legacy.hint': '标「旧格式」的条目来自更早版本，缺少还原信息，仅可彻底删除。',
    'legacy.badge': '旧格式',
    'legacy.restoreTitle': '旧格式条目缺少还原信息，无法还原',
    'action.trash': '移入回收站',
    'action.unarchive': '取消归档',
    'action.archive': '归档',
    'action.deletePermanently': '彻底删除',
    'action.restore': '还原',
    'action.restoreAll': '全部还原（{count}）',
    'action.deleteAll': '全部彻底删除',
    'state.running': '运行中',
    'state.unreleased': '未释放',
    'state.unreleasedActionHint': '该会话仍被 dsh 进程占用（未释放）：请先关闭该会话（或停止生成）再重试；仍被占用可重启 dsh 后操作',
    'state.backendUnsupported': '后端不支持文件级操作',
    'group.unreleased': '未释放（{count}）',
    'confirm.trash': '将会话「{name}」移入回收站？\n\n移入后 @ / 侧边栏不再出现；可随时从回收站还原。',
    'confirm.unarchive': '取消归档会话「{name}」？\n\n会话将回到侧边栏会话列表的原位置。',
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
    'confirm.unarchiving': '正在取消归档…',
    'confirm.archiving': '正在归档…',
    'confirm.restoring': '正在还原…',
    'notice.skippedLegacy': '跳过旧格式 {count} 个',
    'notice.failed': '失败 {count} 个',
    'pager.loadMore': '加载更多（还有 {remaining} 条）',
  },
  en: {
    'button.label': 'Archive',
    'dialog.title': 'Archived Sessions',
    'dialog.close': 'Close',
    'dialog.trashDir': 'Trash: ',
    'dialog.copyHint': 'Click to copy the full path',
    'dialog.copied': 'Copied',
    'trash.hint': 'Sessions in the trash no longer appear in the @ list.',
    'trash.uninstallHint': 'Before uninstalling the plugin, restore or empty the trash; after uninstall, only reinstalling lets you manage it again.',
    'loading': 'Loading…',
    'retry': 'Retry',
    'section.archived': 'Archive ({count})',
    'section.trash': 'Trash ({count})',
    'section.strays': 'Stray sessions ({count})',
    'stray.hint': 'Stray sessions: not in any workspace and not archived; the official UI cannot clean them, and @ keeps showing them.',
    'stray.blankBadge': 'blank',
    'stray.orphanBadge': 'orphan subagent',
    'tree.childCount': '{n} subagents',
    'fact.turns': '{n} turns',
    'stray.ageDays': '{n} days ago',
    'stray.ageToday': 'today',
    'empty.archived': 'No archived sessions',
    'empty.trash': 'Trash is empty',
    'legacy.hint': 'Entries marked "Legacy" come from an earlier version and cannot be restored; they can only be deleted permanently.',
    'legacy.badge': 'Legacy',
    'legacy.restoreTitle': 'Legacy entry has no restore info',
    'action.trash': 'Move to trash',
    'action.unarchive': 'Unarchive',
    'action.archive': 'Archive',
    'action.deletePermanently': 'Delete permanently',
    'action.restore': 'Restore',
    'action.restoreAll': 'Restore all ({count})',
    'action.deleteAll': 'Delete all permanently',
    'state.running': 'Running',
    'state.unreleased': 'Held by dsh',
    'state.unreleasedActionHint': 'This session is still held by the dsh process: close the conversation (or stop generation) and retry; if still held, restart dsh',
    'state.backendUnsupported': 'Backend does not support file operations',
    'group.unreleased': 'Held by dsh ({count})',
    'confirm.trash': 'Move "{name}" to trash?\n\nIt disappears from @ / the sidebar; restore anytime from Trash.',
    'confirm.unarchive': 'Unarchive "{name}"?\n\nThe session returns to its original position in the sidebar session list.',
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
    'confirm.unarchiving': 'Unarchiving…',
    'confirm.archiving': 'Archiving…',
    'confirm.restoring': 'Restoring…',
    'notice.skippedLegacy': 'skipped {count} legacy',
    'notice.failed': '{count} failed',
    'pager.loadMore': 'Load more ({remaining} more)',
  },
} as const

interface ApiEnvelope<T> {
  readonly items?: T[]
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 面板请求超时：host 挂起时不让面板永久 loading（根 AGENTS 网络约定）。
 * 30s：/list 首开要串行做对齐 + 全量扫描 + 冷观察 + 标签梯子，重启后冷启动曾误触 15s（2026-09-03）。 */
const REQUEST_TIMEOUT_MS = 30_000

async function readApi<T>(path: string, init?: RequestInit): Promise<T[]> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const payload = await response.json() as ApiEnvelope<T>
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return payload.items ?? []
}

/** 树形载荷读取（spec 08：/list 返回 tree）。 */
async function readTree<T>(path: string, init?: RequestInit): Promise<T[]> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const payload = await response.json() as { tree?: T[]; error?: { readonly code?: string; readonly message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? '请求失败（HTTP ' + response.status + '）')
  }
  return payload.tree ?? []
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
  // 官方「会话离开 live store」（fiber 销毁，session-controller 转发的 api-session/removed）
  // → 广播窗口事件，面板打开时据此实时刷新 hold 标记（spec 08 §2.5）。
  // 事件名在 cordis Events 与 TypertRemoteEventSelection 均已声明，但 npm 中间态包的
  // Remote 签名推导拼不出该事件（运行时桥接按名称转发，与类型无关），此处做局部结构断言。
  const remote = ctx.remote as unknown as { $on(event: string, handler: () => void): () => void }
  const disposeRemoved = remote.$on('api-session/removed', () => {
    window.dispatchEvent(new CustomEvent('dsh-archive-sessions-changed'))
  })
  ctx.effect(() => disposeRemoved, 'dsh-archive-manage: live 状态实时刷新')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    locale: 'archive-manage',
    id: 'archive-manage',
    order: 20,
    inject: () => ({
      listArchived: () => readTree<ArchivedSessionItem>('/api/archive-manage/list'),
      listStrays: () => readApi<StraySessionItem>('/api/archive-manage/strays'),
      listTrashItems: () => readApi<{
        trashId: string
        sessionId: string
        title: string
        archivedAt: string
        legacy: boolean
        subagents?: Array<{ sessionId: string; title: string }>
      }>('/api/archive-manage/trash'),
      trashDirPath: async () => {
        const response = await fetch('/api/archive-manage/trash-dir', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
        const payload = await response.json() as { path?: string; displayPath?: string; error?: { message?: string } }
        if (!response.ok) {
          throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
        }
        return { path: payload.path ?? '', displayPath: payload.displayPath ?? payload.path ?? '' }
      },
      moveToTrash: (sessionId: string) => postApi('/api/archive-manage/trash', { sessionId, confirm: true }),
      unarchiveSession: (sessionId: string) => postApi('/api/archive-manage/unarchive', { sessionId }),
      archiveSession: (sessionId: string) => postApi('/api/archive-manage/archive', { sessionId }),
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
