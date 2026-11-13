/**
 * Review tab registration: the tab type (title, keepMounted) and the two slots that render its
 * body and chip title.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { NotebookApi } from './api.js'
import { NoteReviewTab, NoteReviewTabTitle } from './review/ReviewTab.js'
import { REVIEW_TAB_ID, REVIEW_TAB_KIND, type ReviewBridge } from './review-bridge.js'

/**
 * Mount the review tab.
 * @param ctx - client context (its slots service).
 * @param notebook - host REST facade for page reads and the draft box.
 * @param bridge - session bridge (composer insertion).
 */
export function mountNoteReviewTab(ctx: ClientContext, notebook: NotebookApi, bridge: ReviewBridge): void {
  const definition: SidebarRightTabDefinition = {
    id: REVIEW_TAB_ID,
    kind: REVIEW_TAB_KIND,
    title: () => ctx.locale.bind(LOCALE_NAMESPACE)('review.tabTitle'),
    // Drafts are persisted, but keeping the body mounted preserves selection/scroll and avoids
    // a re-fetch whenever the user switches to the conversation and back.
    keepMounted: true,
  }
  ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'dsh-desk-one: note review tab')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: REVIEW_TAB_ID,
    locale: LOCALE_NAMESPACE,
    inject: (sessionId: string) => ({ notebook, bridge, sessionId }),
  }, NoteReviewTab))
  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: REVIEW_TAB_ID,
    locale: LOCALE_NAMESPACE,
  }, NoteReviewTabTitle))
}
