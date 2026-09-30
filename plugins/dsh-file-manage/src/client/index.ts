/**
 * dsh-file-manage client half：官方「主面板」入口（左栏上面的图标行 + 中央列的页面）。
 *
 * 形态对齐官方 `ui-plugin-manager`（插件）与 `ui-schedule`（自动化任务），见 spec 03：
 * `main` keyed 槽与 `sidebar.panellist` list 槽**共用同一个 id**。
 * 请求封装见 api.ts、样式见 styles.ts、视图见 CloudFilesPage.tsx；客户端不直接碰任何文件或凭据。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 官方 0.1.7 起 `Context.slots` 的声明在 ui-renderer（纯类型空导入，无运行时代码）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { countApi, deleteApi, listApi } from './api.js'
import { CloudFilesPanel } from './CloudFilesPage.js'
import { CloudFilesPanelIcon } from './CloudFilesPanelIcon.js'
import { attachMainPanel } from './panel.js'
import { ensureFileManageStyles } from './styles.js'

// ⚠️ `layout` **不在这里** —— client half 的 inject 缺服务会让 entry 永远 pending，
// 而客户端 boot 审计把非 active 的 entry 当致命失败；它走 panel.ts 里的可选依赖 fork。
export const inject = ['slots', 'locale']

/** 入口 id：同时是左栏面板行的 id 与中央列 `main` 槽的 key（官方 `MainPanelId`）。 */
export const PANEL_ID = 'file-manage' as MainPanelId

/** 左栏行序：官方 plugins = 0、schedules = 10，本插件沿用原 footer 的 21 号段。 */
const PANEL_ORDER = 21

/** 本插件的 locale 字典（zh/en）。 */
const LOCALE_DICTS = {
  zh: {
    'button.label': '云端文件',
    'dialog.title': '云端文件（DeepSeek Files API）',
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
 * client half 入口：locale 字典 + 官方主面板两处注册。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  ensureFileManageStyles()
  const disposeDictionaries = ctx.locale.register('file-manage', { zh: LOCALE_DICTS.zh, en: LOCALE_DICTS.en })
  ctx.effect(() => disposeDictionaries, 'dsh-file-manage: locale dictionaries')
  // 官方主面板两处注册（`main` 页面 + `sidebar.panellist` 图标行）走可选依赖 fork：
  // 官方布局服务不在位时整条不注册（惰性停用、不抛错），宿主照常启动。
  attachMainPanel(ctx, {
    id: PANEL_ID,
    order: PANEL_ORDER,
    locale: 'file-manage',
    label: () => ctx.locale.bind('file-manage')('button.label'),
    inject: () => ({
      listFiles: listApi,
      deleteFile: deleteApi,
      countFiles: countApi,
    }),
    page: CloudFilesPanel,
    icon: CloudFilesPanelIcon,
  })
}

export { CloudFilesPanel } from './CloudFilesPage.js'
export type { CloudFilesPanelInjected, CloudFilesPanelProps } from './CloudFilesPage.js'
export { CloudFilesPanelIcon } from './CloudFilesPanelIcon.js'
export { attachMainPanel } from './panel.js'
export { ensureFileManageStyles } from './styles.js'
export { countApi, deleteApi, listApi } from './api.js'
export type { FileCountSummary } from './api.js'
