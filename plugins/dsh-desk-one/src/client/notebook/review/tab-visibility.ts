

const visibleTabs = new Set<string>()
const listeners = new Set<() => void>()


function notify(): void {
  for (const listener of listeners) listener()
}


export function reviewTabVisible(): boolean {
  return visibleTabs.size > 0
}


export function showReviewTab(tabId: string): () => void {
  if (!visibleTabs.has(tabId)) {
    visibleTabs.add(tabId)
    notify()
  }
  return () => {
    if (visibleTabs.delete(tabId)) notify()
  }
}


export function subscribeReviewTabVisibility(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
