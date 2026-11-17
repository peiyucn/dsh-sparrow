

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { NotebookApi } from './api.js'
import { NoteReviewTab, NoteReviewTabTitle } from './review/ReviewTab.js'
import { REVIEW_TAB_ID, REVIEW_TAB_KIND, type ReviewBridge } from './review-bridge.js'


export function mountNoteReviewTab(ctx: ClientContext, notebook: NotebookApi, bridge: ReviewBridge): void {
  const definition: SidebarRightTabDefinition = {
    id: REVIEW_TAB_ID,
    kind: REVIEW_TAB_KIND,
    title: () => ctx.locale.bind(LOCALE_NAMESPACE)('review.tabTitle'),


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
