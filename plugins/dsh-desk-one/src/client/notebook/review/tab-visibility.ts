/**
 * Whether a note-review tab is currently on screen.
 *
 * The conversation composer hint describes review mode, and the right pane does not always show
 * it: opening the official file browser from the notebook page leaves the pane on a file preview
 * whose Review view entry has not been clicked yet. Tabs keep their body mounted while hidden
 * (`keepMounted`), so visibility is tracked per tab occurrence instead of by mount lifetime.
 */

const visibleTabs = new Set<string>()
const listeners = new Set<() => void>()

/** Notify every visibility subscriber. */
function notify(): void {
  for (const listener of listeners) listener()
}

/** Whether any review tab is on screen. */
export function reviewTabVisible(): boolean {
  return visibleTabs.size > 0
}

/**
 * Mark one tab occurrence visible.
 * @param tabId - the review tab occurrence.
 * @returns release that removes the mark.
 */
export function showReviewTab(tabId: string): () => void {
  if (!visibleTabs.has(tabId)) {
    visibleTabs.add(tabId)
    notify()
  }
  return () => {
    if (visibleTabs.delete(tabId)) notify()
  }
}

/**
 * Subscribe to visibility changes.
 * @param listener - called after every mark or release that changed the set.
 * @returns unsubscribe.
 */
export function subscribeReviewTabVisibility(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
