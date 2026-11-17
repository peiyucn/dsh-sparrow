

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
import { ReviewComposerHint } from './notebook/ReviewPromptDock.js'
import { ReviewSessionIcon } from './notebook/ReviewSessionIcon.js'
import { ReviewSessionTrailingIcon } from './notebook/ReviewSessionTrailingIcon.js'
import { hydrateReviewSessions } from './notebook/review/sessions.js'
import { createCoauthorBridge } from './coauthor.js'
import { DESK_TAB_ICONS, DeskBaseIcon } from './tabIcons.js'
import { installDeskClient, passesClientGate } from './install.js'





export const inject = ['slots', 'locale']


export function apply(ctx: ClientContext): void {
  if (!passesClientGate(ctx)) return



  const sessionLink = createSessionLinkBridge()
  ctx.inject(['sessions', 'workspaces', 'uiWorkspace'], (sessionCtx) => {
    const detach = sessionLink.attach(sessionCtx as unknown as SessionServices)
    sessionCtx.effect(() => detach, `${PACKAGE_NAME}: session link`)
  })



  const workspaceAccess = createWorkspaceAccess()
  ctx.inject(['workspaces'], (workspaceCtx) => {
    const detach = workspaceAccess.attach(workspaceCtx.get('workspaces') as never)
    workspaceCtx.effect(() => detach, `${PACKAGE_NAME}: notebook workspaces`)
  })
  ctx.inject(['uiWorkspace'], (navigationCtx) => {
    const detach = workspaceAccess.attachNavigation(navigationCtx.get('uiWorkspace') as never)
    navigationCtx.effect(() => detach, `${PACKAGE_NAME}: notebook navigation`)
  })



  const coauthor = createCoauthorBridge()
  ctx.inject(['uiWorkspace'], (navigationCtx) => {
    const detach = coauthor.attachNavigation(navigationCtx.get('uiWorkspace') as never)
    navigationCtx.effect(() => detach, `${PACKAGE_NAME}: coauthor navigation`)
  })


  const review = createReviewBridge()
  ctx.inject(['sidebarRight'], (sidebarCtx) => {
    const detach = review.attachSidebar(sidebarCtx.get('sidebarRight') as never)
    sidebarCtx.effect(() => detach, `${PACKAGE_NAME}: review sidebar`)
  })
  ctx.inject(['sessions'], (sessionCtx) => {
    const detach = review.attachSessions(sessionCtx.get('sessions') as never)
    sessionCtx.effect(() => detach, `${PACKAGE_NAME}: review sessions`)
  })

  ctx.inject(['workspaces'], (workspaceCtx) => {
    const detach = review.attachWorkspaces(workspaceCtx.get('workspaces') as never)
    workspaceCtx.effect(() => detach, `${PACKAGE_NAME}: review workspaces`)
  })
  ctx.inject(['uiWorkspace'], (navigationCtx) => {
    const detach = review.attachNavigation(navigationCtx.get('uiWorkspace') as never)
    navigationCtx.effect(() => detach, `${PACKAGE_NAME}: review navigation`)
  })
  ctx.inject(['sidebarRightTabs'], (tabCtx) => {
    mountNoteReviewTab(tabCtx, notebookApi, review)
  })


  ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.actions',
    id: 'desk-one-note-review',
    order: 100,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ notebook: notebookApi, review, workspaceAccess }),
  }, DocReviewAction))

  installDeskClient(ctx, {
    page: DeskOnePage,
    baseIcon: DeskBaseIcon,
    icons: DESK_TAB_ICONS,
    locales: LOCALE_DICTS,
    api: {
      notebook: notebookApi,
      workspaceAccess,
      openReview: review.open,
      startWithPrompt: (prompt) => { coauthor.start(prompt) },
      openBrowser: review.openFilesBrowser,
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

  hydrateReviewSessions(notebookApi)

  void ctx.slots.inject('sidebar.session.row.leading' as never, () => {
    try {
      return ctx.slots.register({
        name: 'sidebar.session.row.leading' as never,
        id: 'dsh-desk-one-review-session',
        order: 40,
        locale: LOCALE_NAMESPACE,
        inject: () => ({ notebook: notebookApi }),
      } as never, ReviewSessionIcon as never)
    } catch {

      return () => {}
    }
  })


  void ctx.slots.inject('sidebar.session.row.trailing' as never, () => {
    try {
      return ctx.slots.register({
        name: 'sidebar.session.row.trailing' as never,
        id: 'dsh-desk-one-review-session-busy',
        order: 40,
        locale: LOCALE_NAMESPACE,
      } as never, ReviewSessionTrailingIcon as never)
    } catch {
      return () => {}
    }
  })



  void ctx.slots.inject('conversation.input.overlay' as never, () => {
    try {
      return ctx.slots.register({
        name: 'conversation.input.overlay' as never,
        id: 'dsh-desk-one-review-prompt',
        order: 30,
        locale: LOCALE_NAMESPACE,
      } as never, ReviewComposerHint as never)
    } catch {

      return () => {}
    }
  })

}
