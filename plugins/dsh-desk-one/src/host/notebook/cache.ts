/**
 * TTL + single-flight cache for the notebook library scan.
 *
 * The cache is keyed by the linked root: the root setting can change while a scan for the previous
 * root is still running, and a request for the new root must never receive the previous root's
 * entries (they describe another folder). Concurrent requests for the same root share one scan; a
 * scan that started before `invalidate` may not refill the cache, otherwise a root change would be
 * overwritten by the scan of the old setting.
 *
 * Pure logic (the scan function is injected), so the concurrency rules are unit-testable without
 * touching the file system.
 */

export interface LibraryScanCache<T> {
  /**
   * Entries of one root: a fresh scan within the TTL, or the in-flight scan of the same root.
   * A scan of a different root is never reused; wait for it, then scan this root.
   * @param root - absolute library root.
   * @returns the indexed entries of that root.
   */
  get(root: string): Promise<readonly T[]>
  /** Drop the cached entries; the next `get` rescans (in-flight scans cannot refill the cache). */
  invalidate(): void
}

/**
 * @param scan - performs one full scan of a root.
 * @param ttlMs - how long a finished scan may be reused.
 * @param now - clock (injectable for tests).
 * @returns the root-keyed scan cache.
 */
export function createLibraryCache<T>(
  scan: (root: string) => Promise<readonly T[]>,
  ttlMs: number,
  now: () => number = Date.now,
): LibraryScanCache<T> {
  let cached: { readonly root: string; readonly at: number; readonly entries: readonly T[] } | undefined
  let pending: { readonly root: string; readonly promise: Promise<readonly T[]> } | undefined
  /** Bumped by invalidate; a scan started in an older generation only returns data, it does not cache it. */
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
        // Another root is scanning: never hand its entries back for this root; wait for it so two
        // full scans cannot overlap, then loop (another caller may have started ours meanwhile).
        await running.promise.catch(() => undefined)
      }
      const startedAt = generation
      const promise = scan(root).then((entries) => {
        if (generation === startedAt) cached = { root, at: now(), entries }
        return entries
      })
      /** Self-reference for the identity check in `finally`: only this scan may clear its own slot. */
      let entry: { readonly root: string; readonly promise: Promise<readonly T[]> } | undefined
      const tracked = promise.finally(() => {
        if (pending === entry) pending = undefined
      })
      entry = { root, promise: tracked }
      pending = entry
      return await tracked
    },
    invalidate() {
      generation += 1
      cached = undefined
    },
  }
}
