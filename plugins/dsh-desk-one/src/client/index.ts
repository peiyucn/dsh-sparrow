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
import { ReviewComposerHint } from './notebook/ReviewPromptDock.js'
import { ReviewSessionIcon } from './notebook/ReviewSessionIcon.js'
import { ReviewSessionTrailingIcon } from './notebook/ReviewSessionTrailingIcon.js'
import { hydrateReviewSessions } from './notebook/review/sessions.js'
import { createCoauthorBridge } from './coauthor.js'
import { DESK_TAB_ICONS, DeskBaseIcon } from './tabIcons.js'
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

  // "和 DSH 一起" entry: prefill the Workspace blank's composer from the panel (never sends).
  // Optional service: without it the entry stays inert and the panel keeps working.
  const coauthor = createCoauthorBridge()
  ctx.inject(['uiWorkspace'], (navigationCtx) => {
    const detach = coauthor.attachNavigation(navigationCtx.get('uiWorkspace') as never)
    navigationCtx.effect(() => detach, `${PACKAGE_NAME}: coauthor navigation`)
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
  // The archived set decides whether a note's previous review Session can be reopened.
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
  // Official document-preview header: one extra action that starts a review session for
  // notebook files. The official preview itself is untouched.
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
  // Durable markers drive both the sidebar icon and the conversation hint after a restart.
  hydrateReviewSessions(notebookApi)
  // Leading decoration on Session rows opened by the review flow (official session-row slot).
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
      // The workspace package is optional; never let a row decoration take the panel down.
      return () => {}
    }
  })
  // Busy review rows show a status dot in the leading cell, so mirror the mark in the trailing slot
  // while the Session is running / waiting.
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
  // Placeholder-style review guidance inside the composer card: every review Session shows it
  // whenever the composer is empty, so opening an old review conversation does not fall back to
  // the official placeholder.
  void ctx.slots.inject('conversation.input.overlay' as never, () => {
    try {
      return ctx.slots.register({
        name: 'conversation.input.overlay' as never,
        id: 'dsh-desk-one-review-prompt',
        order: 30,
        locale: LOCALE_NAMESPACE,
      } as never, ReviewComposerHint as never)
    } catch {
      // The conversation slot is optional; never let the hint take the whole panel down.
      return () => {}
    }
  })

}
