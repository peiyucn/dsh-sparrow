/**
 * dsh-archive-manage client half：官方「主面板」入口（左栏上面的图标行 + 中央列的页面）。
 *
 * 形态对齐官方 `ui-plugin-manager`（插件）与 `ui-schedule`（自动化任务），见 * `main` keyed 槽与 `sidebar.panellist` list 槽**共用同一个 id**。
 * 所有写操作都走 host 自有路由；客户端不直接碰文件。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ArchivePanel } from './ArchivePage.js'
import { ArchivePanelIcon } from './ArchivePanelIcon.js'
import { LOCALE_DICTS } from './i18n.js'
import { installArchiveClient, passesClientGate } from './install.js'

// remote：官方 Remote 事件载体（api-session/* 桥接）；硬依赖，缺失时 install 里的能力门会惰性停用。
// ⚠️ `layout` **不在这里** —— client half 的 inject 缺服务会让 entry 永远 pending，
// 而客户端 boot 审计把非 active 的 entry 当致命失败；它走 panel.ts 里的可选依赖 fork。
export const inject = ['slots', 'locale', 'remote']

/**
 * client half 入口：先跑能力门（缺失只告警并返回），再把浏览器侧件交给 install。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  // 首步自检：不通过就不注册任何槽位 / 样式 / 监听，也不抛错（抛错会让整页 boot 失败）。
  if (!passesClientGate(ctx)) return
  installArchiveClient(ctx, { page: ArchivePanel, icon: ArchivePanelIcon, locales: LOCALE_DICTS })
}
