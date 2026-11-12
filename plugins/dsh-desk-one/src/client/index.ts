/**
 * dsh-desk-one client half: the official main-panel entry (sidebar icon row + centre column page).
 * Shaped like the official `ui-plugin-manager` / `ui-schedule` panels:
 * the `main` keyed slot and the `sidebar.panellist` list slot share one id, and every read/write
 * goes through this plugin's own host routes.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { LOCALE_NAMESPACE, PACKAGE_NAME } from '../constants.js'
import * as api from './notes/api.js'
import * as taskApi from './tasks/api.js'
import { DeskOnePage } from './app/DeskOnePage.js'
import { notebookApi } from './notebook/api.js'
import { createReviewBridge } from './notebook/review-bridge.js'
import { DocReviewAction } from './notebook/DocReviewAction.js'
import { mountNoteReviewTab } from './notebook/register.js'
import { createWorkspaceAccess } from './notebook/workspaces.js'
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


  // Notebook library access goes through DSH's own workspace flow (picker + registration).
  const workspaceAccess = createWorkspaceAccess()
  ctx.inject(['workspaces'], (workspaceCtx) => {
    const detach = workspaceAccess.attach(workspaceCtx.get('workspaces') as never)
    workspaceCtx.effect(() => detach, `${PACKAGE_NAME}: notebook workspaces`)
  })
  ctx.inject(['uiWorkspace'], (navigationCtx) => {
    const detach = workspaceAccess.attachNavigation(navigationCtx.get('uiWorkspace') as never)
    navigationCtx.effect(() => detach, `${PACKAGE_NAME}: notebook navigation`)
  })

  // A review opens its own session in the library workspace and the tab binds to that session.
  const review = createReviewBridge()
  ctx.inject(['sidebarRight'], (sidebarCtx) => {
    const detach = review.attachSidebar(sidebarCtx.get('sidebarRight') as never)
    sidebarCtx.effect(() => detach, `${PACKAGE_NAME}: review sidebar`)
  })
  ctx.inject(['sessions'], (sessionCtx) => {
    const detach = review.attachSessions(sessionCtx.get('sessions') as never)
    sessionCtx.effect(() => detach, `${PACKAGE_NAME}: review sessions`)
  })
  ctx.inject(['uiWorkspace'], (navigationCtx) => {
    const detach = review.attachNavigation(navigationCtx.get('uiWorkspace') as never)
    navigationCtx.effect(() => detach, `${PACKAGE_NAME}: review navigation`)
  })
  ctx.inject(['sidebarRightTabs'], (tabCtx) => {
    mountNoteReviewTab(tabCtx, notebookApi, review)
  })
  // Official document-preview header: one extra action that starts a review session for
  // notebook files. The official preview itself is untouched.
  ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.actions',
    id: 'desk-one-note-review',
    locale: LOCALE_NAMESPACE,
    inject: () => ({ notebook: notebookApi, review, workspaceAccess }),
  }, DocReviewAction))

  installDeskClient(ctx, {
    page: DeskOnePage,
    icon: DeskPanelIcon,
    locales: LOCALE_DICTS,
    api: {
      notebook: notebookApi,
      workspaceAccess,
      openReview: review.open,
      draftWithAi: review.draftInNewSession,
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
