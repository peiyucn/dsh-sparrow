/**
 * Header-facts cache and small concurrency helpers: a single-flight TTL store shared by startup,
 * /list and /strays, an LRU cache for labels, and a whole-batch abort budget.
 */

export interface HeaderFactsStore<F> {
  get(): Promise<F>
  invalidate(): void
}

export function createHeaderFactsStore<F>(
  load: () => Promise<F>,
  ttlMs: number,
  now: () => number = Date.now,
): HeaderFactsStore<F> {
  let cached: F | undefined
  let fetchedAt = -Infinity
  let inflight: Promise<F> | undefined
  let generation = 0
  return {
    async get(): Promise<F> {
      if (cached !== undefined && now() - fetchedAt < ttlMs) return cached
      if (inflight === undefined) {
        const startedAt = generation
        const attempt = load().then(value => {
          if (generation === startedAt) {
            cached = value
            fetchedAt = now()
          }
          return value
        }).finally(() => {
          // Only clear its own generation: after invalidate a new load has already replaced inflight, so an old load settling must not clear the new generation by mistake.
          if (inflight === attempt) inflight = undefined
        })
        inflight = attempt
      }
      return inflight
    },
    invalidate(): void {
      generation += 1
      cached = undefined
      fetchedAt = -Infinity
      inflight = undefined
    },
  }
}

/**
 * Value of the official subagent projection unit (the minimal shape of `SubagentIdentityProjection`,
 * official projection-types.ts:28): a discriminated union (mode one-shot / continuable) plus an optional label.
 * This plugin only cares whether a label exists, so it asserts the minimal shape and does not replicate the
 * official mode discriminant.
 */
export interface SubagentIdentityValue {
  readonly label?: string
  /**
   * Position of the `subagent/descriptor` event that folded this identity. The official code uses it to prove
   * the descriptor comes from the child session's **own** suffix (`Session.isOwnSeq`, the own-suffix gate at
   * official list-children.ts:224-225) rather than an ancestor descriptor inherited from the fork seed.
   * Missing/malformed means ownership cannot be verified.
   */
  readonly seq?: number
}

/**
 * Authoritative identity → label conclusion.
 *
 * A non-null `identity` means the official code already folded a subagent descriptor on this log (the official
 * `subagent` unit's view = `state.identity ?? null`, projection.ts:178); a descriptor is immutable once
 * appended (official note "a descriptor is immutable once appended") and sits at the start of the child
 * session's log, so folding it once holds forever. `label` is **optional** for one-shot child sessions
 * (projection-types.ts:30-33), so the correct reading of "identity but no label" is "this session really has
 * no label", not "not folded yet" — there is no reason to re-fold the whole log for it.
 *
 * @param identity - Value of the official subagent projection unit (same shape in the live snapshot / cache row / log fold).
 * @returns With label = the label string; authoritatively no label = `null`; undeterminable (identity missing or null) = `undefined`.
 */
export function labelFromSubagentIdentity(identity: SubagentIdentityValue | null | undefined): string | null | undefined {
  if (identity === null || typeof identity !== 'object') return undefined
  const label: unknown = identity.label
  return typeof label === 'string' && label.trim() !== '' ? label : null
}

/**
 * Bounded LRU cache (pure logic, unit-testable): Map insertion order is access order,
 * a get hit deletes and re-inserts = moves to newest; a set beyond the cap evicts the least recently used entry.
 * The value domain excludes undefined (a missing key is indistinguishable from "value is undefined"); null is
 * allowed (conclusions like "authoritatively no label" must be remembered too, otherwise the log would be
 * re-folded every time), so callers must never store undefined values.
 */
interface LruCache<K, V> {
  get(key: K): V | undefined
  set(key: K, value: V): void
  readonly size: number
}

export function createLruCache<K, V>(maxEntries: number): LruCache<K, V> {
  const entries = new Map<K, V>()
  return {
    get(key) {
      const value = entries.get(key)
      if (value !== undefined) {
        entries.delete(key)
        entries.set(key, value)
      }
      return value
    },
    set(key, value) {
      entries.delete(key)
      entries.set(key, value)
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next().value as K | undefined
        if (oldest !== undefined) entries.delete(oldest)
      }
    },
    get size() {
      return entries.size
    },
  }
}

/**
 * Budget signal that can be released early (pure logic, unit-testable): AbortSignal.timeout's timer stays
 * alive until the deadline even after the batch ends (it isn't released on the success path); here we build our
 * own AbortController + timer instead, and release() clears the timer on both success and failure paths, so no
 * handle lingers.
 */
export function createBudgetSignal(timeoutMs: number): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`预算超时（${timeoutMs}ms）`))
  }, timeoutMs)
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer)
    },
  }
}

/**
 * Bounded-concurrency execution (pure logic, unit-testable): at most `limit` workers pull tasks in order;
 * a single task failure only records undefined at its position and does not abort the others; results stay
 * aligned with the input.
 */
export async function runBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array<R | undefined>(items.length)
  if (items.length === 0) return results
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      const item = items[index] as T
      try {
        results[index] = await work(item)
      } catch {
        results[index] = undefined
      }
    }
  })
  await Promise.all(workers)
  return results
}
