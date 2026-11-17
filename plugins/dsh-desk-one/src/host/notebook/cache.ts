

export interface LibraryScanCache<T> {

  get(root: string): Promise<readonly T[]>

  invalidate(): void
}


export function createLibraryCache<T>(
  scan: (root: string) => Promise<readonly T[]>,
  ttlMs: number,
  now: () => number = Date.now,
): LibraryScanCache<T> {
  let cached: { readonly root: string; readonly at: number; readonly entries: readonly T[] } | undefined
  let pending: { readonly root: string; readonly promise: Promise<readonly T[]> } | undefined

  let generation = 0

  const freshOf = (root: string): readonly T[] | undefined =>
    cached !== undefined && cached.root === root && now() - cached.at < ttlMs ? cached.entries : undefined

  return {
    async get(root) {
      for (;;) {
        const fresh = freshOf(root)
        if (fresh !== undefined) return fresh
        const running = pending
        if (running === undefined) break
        if (running.root === root) return await running.promise


        await running.promise.catch(() => undefined)
      }
      const startedAt = generation
      const promise = scan(root).then((entries) => {
        if (generation === startedAt) cached = { root, at: now(), entries }
        return entries
      })

      const entry: { readonly root: string; promise: Promise<readonly T[]> } = { root, promise }
      const tracked = promise.finally(() => {
        if (pending === entry) pending = undefined
      })
      entry.promise = tracked
      pending = entry
      return await tracked
    },
    invalidate() {
      generation += 1
      cached = undefined
    },
  }
}
