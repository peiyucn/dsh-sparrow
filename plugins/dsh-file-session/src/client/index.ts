/**
 * dsh-file-session client half：sidebar footer 入口 + 云端文件弹窗。
 * 请求封装见 api.ts、样式见 styles.ts、视图见 FileSessionDock.tsx；客户端不直接碰任何文件或凭据。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { countApi, deleteApi, listApi } from './api.js'
import { FileSessionDock } from './FileSessionDock.js'
import { ensureFileSessionStyles } from './styles.js'

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

export { FileSessionDock } from './FileSessionDock.js'
export type { FileSessionDockInjected, FileSessionDockProps } from './FileSessionDock.js'
export { ensureFileSessionStyles } from './styles.js'
export { countApi, deleteApi, listApi } from './api.js'
export type { FileCountSummary } from './api.js'
