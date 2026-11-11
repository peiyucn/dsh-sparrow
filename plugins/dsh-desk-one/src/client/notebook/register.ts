/**
 * Registration of the note-review right-sidebar tab.
 *
 * Runs inside the optional fork that holds `sidebarRightTabs`, so a host without
 * the right sidebar simply never registers it (no throw, panel still boots).
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { NotebookApi } from './api.js'
import { NoteReviewTab, NoteReviewTabTitle } from './review.js'
import { REVIEW_TAB_ID, REVIEW_TAB_KIND, type NoteReviewParams } from './review-bridge.js'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    'note-review': NoteReviewParams
  }
}

/**
 * Register the review tab type and its body / chip.
 * @param ctx - fork context that owns the sidebar-right services.
 * @param notebook - host REST facade.
 */
export function mountNoteReviewTab(ctx: ClientContext, notebook: NotebookApi): void {
  const definition: SidebarRightTabDefinition = {
    id: REVIEW_TAB_ID,
    kind: REVIEW_TAB_KIND,
    title: () => ctx.locale.bind(LOCALE_NAMESPACE)('review.tabTitle'),
  }
  ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'dsh-desk-one: note review tab')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: REVIEW_TAB_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ notebook }),
  }, NoteReviewTab))
  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: REVIEW_TAB_ID,
    locale: LOCALE_NAMESPACE,
  }, NoteReviewTabTitle))
}
