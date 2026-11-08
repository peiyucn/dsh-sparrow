/**
 * dsh-desk-one client half：官方「主面板」入口（左栏图标行 + 中央列页面）。
 * 形态对齐官方 `ui-plugin-manager` / `ui-schedule` 与本仓库 dsh-archive-manage：
 * `main` keyed 槽与 `sidebar.panellist` list 槽**共用同一个 id**；所有读写都走 host 自有路由。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { PACKAGE_NAME } from '../constants.js'
import * as api from './notes/api.js'
import * as taskApi from './tasks/api.js'
import { DeskOnePage } from './app/DeskOnePage.js'
import { createSessionLinkBridge, type SessionServices } from './sessions/bridge.js'
import { scheduleApi } from './schedule/api.js'
import { sessionsArchiveApi } from './sessions/archiveApi.js'
import { LOCALE_DICTS } from './i18n.js'
import { DeskPanelIcon } from './icon.js'
import { installDeskClient, passesClientGate } from './install.js'

// `layout` 不在这里：client half 的 inject 缺服务会让 entry 永远 pending，
// 而客户端 boot 审计把非 active 的 entry 当致命失败；它走 panel.ts 里的可选依赖 fork。
export const inject = ['slots', 'locale']

/** client half 入口：先跑能力门（缺失只告警并返回），再把浏览器侧件交给 install。 */
export function apply(ctx: ClientContext): void {
  if (!passesClientGate(ctx)) return

  // Session linkage is optional: attach only when the host exposes all three public services.
  // Missing services leave the facade disabled, so the task board renders without session chips.
  const sessionLink = createSessionLinkBridge()
  ctx.inject(['sessions', 'workspaces', 'uiWorkspace'], (sessionCtx) => {
    const detach = sessionLink.attach(sessionCtx as unknown as SessionServices)
    sessionCtx.effect(() => detach, `${PACKAGE_NAME}: session link`)
  })

  installDeskClient(ctx, {
    page: DeskOnePage,
    icon: DeskPanelIcon,
    locales: LOCALE_DICTS,
    api: {
      listNotes: api.listNotes,
      createNote: api.createNote,
      updateNote: api.updateNote,
      deleteNote: api.deleteNote,
      listTasks: taskApi.listTasks,
      createTask: taskApi.createTask,
      updateTask: taskApi.updateTask,
      deleteTask: taskApi.deleteTask,
      listGroups: taskApi.listGroups,
      createGroup: taskApi.createGroup,
      updateGroup: taskApi.updateGroup,
      moveGroup: taskApi.moveGroup,
      archiveGroup: taskApi.archiveGroup,
      deleteGroup: taskApi.deleteGroup,
      sessionLink: sessionLink.api,
      sessionsArchive: sessionsArchiveApi,
      schedule: scheduleApi,
    },
  })
}
