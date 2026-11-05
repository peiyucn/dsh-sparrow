/**
 * dsh-desk-one client half：官方「主面板」入口（左栏图标行 + 中央列页面）。
 * 形态对齐官方 `ui-plugin-manager` / `ui-schedule` 与本仓库 dsh-archive-manage：
 * `main` keyed 槽与 `sidebar.panellist` list 槽**共用同一个 id**；所有读写都走 host 自有路由。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import * as api from './api.js'
import { DeskOnePage } from './DeskOnePage.js'
import { LOCALE_DICTS } from './i18n.js'
import { DeskPanelIcon } from './icon.js'
import { installDeskClient, passesClientGate } from './install.js'

// `layout` 不在这里：client half 的 inject 缺服务会让 entry 永远 pending，
// 而客户端 boot 审计把非 active 的 entry 当致命失败；它走 panel.ts 里的可选依赖 fork。
export const inject = ['slots', 'locale']

/** client half 入口：先跑能力门（缺失只告警并返回），再把浏览器侧件交给 install。 */
export function apply(ctx: ClientContext): void {
  if (!passesClientGate(ctx)) return
  installDeskClient(ctx, {
    page: DeskOnePage,
    icon: DeskPanelIcon,
    locales: LOCALE_DICTS,
    api: {
      listNotes: api.listNotes,
      createNote: api.createNote,
      updateNote: api.updateNote,
      deleteNote: api.deleteNote,
    },
  })
}
