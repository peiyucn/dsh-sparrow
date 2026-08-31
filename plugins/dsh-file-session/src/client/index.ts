/**
 * dsh-file-session client half：sidebar footer 入口 + 云端文件弹窗。
 * 列表与删除都走 host 自有路由；客户端不直接碰任何文件或凭据。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { FileSessionDock, ensureFileSessionStyles } from './FileSessionDock.js'
import type { FileCountSummary } from './FileSessionDock.js'
import type { FileRow } from '../files.js'

export const inject = ['slots', 'locale']

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'button.label': '云端文件',
    'dialog.title': '云端文件（DeepSeek Files API）',
    'dialog.close': '关闭',
    'loading': '加载中…',
    'loadMore': '加载更多',
    'summary.count': '共 {count} 个文件',
    'summary.loaded': '已加载 {loaded} / 共 {count} 个文件',
    'quota.used': '已用 {percent}',
    'empty': '暂无云端文件',
    'dshBadge': 'DSH 自动上传',
    'expires': '到期 {time}',
    'copy': '复制 file_id',
    'copied': '已复制',
    'copyFailed': '复制失败（浏览器可能未授权剪贴板）',
    'delete': '删除',
    'retry': '重试',
    'confirm.confirm': '确认删除',
    'confirm.cancel': '取消',
    'confirm.deleting': '正在删除…',
    'confirm.delete': '删除「{name}」？\n\n删除后，引用它的会话再次使用时官方会自动重新上传（可能稍慢）。',
    'confirm.deleteDsh': '此文件由 DSH 自动上传，可能仍被会话引用。\n\n删除「{name}」？删除后再次引用时官方会自动重新上传。',
  },
  en: {
    'button.label': 'Cloud Files',
    'dialog.title': 'Cloud Files (DeepSeek Files API)',
    'dialog.close': 'Close',
    'loading': 'Loading…',
    'loadMore': 'Load more',
    'summary.count': '{count} files',
    'summary.loaded': '{loaded} / {count} files',
    'quota.used': '{percent} used',
    'empty': 'No cloud files',
    'dshBadge': 'DSH auto-uploaded',
    'expires': 'expires {time}',
    'copy': 'Copy file_id',
    'copied': 'Copied',
    'copyFailed': 'Copy failed (clipboard may be blocked by the browser)',
    'delete': 'Delete',
    'retry': 'Retry',
    'confirm.confirm': 'Delete',
    'confirm.cancel': 'Cancel',
    'confirm.deleting': 'Deleting…',
    'confirm.delete': 'Delete "{name}"?\n\nSessions that reference it will transparently re-upload on next use (may be slower).',
    'confirm.deleteDsh': 'This file was auto-uploaded by DSH and may still be referenced by sessions.\n\nDelete "{name}"? It will transparently re-upload on next use.',
  },
} as const

interface ListEnvelope {
  readonly items?: FileRow[]
  readonly hasMore?: boolean
  readonly lastId?: string
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 面板请求超时：host 挂起时不让面板永久 loading（根 AGENTS 网络约定）。 */
const REQUEST_TIMEOUT_MS = 15_000
/** 总数统计超时：host 侧要游标翻到底（配额内最多 10 页），放宽到 60s。 */
const COUNT_TIMEOUT_MS = 60_000

async function listApi(after?: string): Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }> {
  // limit 不传：host 归一化缺省回退 PAGE_SIZE（页大小只活在一处，避免两端漂移）。
  const params = new URLSearchParams()
  if (after !== undefined) params.set('after', after)
  const response = await fetch(`/api/file-session/list?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json() as ListEnvelope
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return {
    rows: payload.items ?? [],
    hasMore: payload.hasMore ?? false,
    ...payload.lastId === undefined ? {} : { lastId: payload.lastId },
  }
}

async function countApi(): Promise<FileCountSummary> {
  const response = await fetch('/api/file-session/count', { signal: AbortSignal.timeout(COUNT_TIMEOUT_MS) })
  const payload = await response.json() as Partial<FileCountSummary> & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return {
    count: payload.count ?? 0,
    totalBytes: payload.totalBytes ?? 0,
    totalBytesLabel: payload.totalBytesLabel ?? '0 B',
    quotaBytes: payload.quotaBytes ?? 0,
    quotaBytesLabel: payload.quotaBytesLabel ?? '0 B',
    quotaCount: payload.quotaCount ?? 0,
  }
}

async function deleteApi(id: string): Promise<void> {
  const params = new URLSearchParams({ id })
  const response = await fetch(`/api/file-session/files?${params.toString()}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json() as { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
}

/**
 * client half 入口：注册 locale 字典 + sidebar footer action。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  ensureFileSessionStyles()
  const disposeDictionaries = ctx.locale.register('file-session', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-file-session: locale dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    locale: 'file-session',
    id: 'file-session',
    order: 21,
    inject: () => ({
      listFiles: listApi,
      deleteFile: deleteApi,
      countFiles: countApi,
    }),
  }, FileSessionDock))
}

export { FileSessionDock, ensureFileSessionStyles } from './FileSessionDock.js'
export type { FileSessionDockInjected, FileSessionDockProps } from './FileSessionDock.js'
