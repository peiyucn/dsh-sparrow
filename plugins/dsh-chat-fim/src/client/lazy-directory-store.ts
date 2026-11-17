

import type { SessionId } from '@deepseek-ai/dsh-session/types'


export interface LazyDirectorySource<S> {
  getSnapshot(): { current: S | null }
  subscribe(listener: () => void): () => void
}


export function createLazyDirectoryStore<S>(
  directoryFor: (sessionId: SessionId) => LazyDirectorySource<S> | undefined,
  sessionId: SessionId | undefined,
): { getSnapshot: () => S | null; subscribe: (listener: () => void) => () => void } {
  let resolved: LazyDirectorySource<S> | undefined

  const pending = new Map<() => void, (() => void) | undefined>()
  const ensure = (): LazyDirectorySource<S> | undefined => {
    if (resolved !== undefined) return resolved
    if (sessionId === undefined) return undefined
    try {
      const hit = directoryFor(sessionId)
      if (hit !== undefined) {
        resolved = hit

        for (const listener of pending.keys()) {
          pending.set(listener, hit.subscribe(listener))
          listener()
        }
      }
    } catch {

    }
    return resolved
  }
  return {
    getSnapshot: () => ensure()?.getSnapshot().current ?? null,
    subscribe: (listener) => {
      const hit = ensure()
      if (hit !== undefined) return hit.subscribe(listener)
      pending.set(listener, undefined)
      return () => {
        pending.get(listener)?.()
        pending.delete(listener)
      }
    },
  }
}
