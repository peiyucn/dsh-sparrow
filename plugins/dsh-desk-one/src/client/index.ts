/**
 * dsh-desk-one client half: the official main-panel entry (sidebar icon row + centre column page).
 * Shaped like the official `ui-plugin-manager` / `ui-schedule` panels:
 * the `main` keyed slot and the `sidebar.panellist` list slot share one id, and every read/write
 * goes through this plugin's own host routes.
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

// `layout` is deliberately absent: a missing service in a client-half `inject` keeps the entry
// pending forever,
// and the client boot audit treats a non-active entry as fatal. It is wired through the optional
// dependency fork in panel.ts instead.
export const inject = ['slots', 'locale']

/** Client-half entry: run the capability gate first (warn and return, never throw), then hand the
 * browser-side pieces to install. */
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
