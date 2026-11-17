

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


export interface SubagentIdentityValue {
  readonly label?: string

  readonly seq?: number
}


export function labelFromSubagentIdentity(identity: SubagentIdentityValue | null | undefined): string | null | undefined {
  if (identity === null || typeof identity !== 'object') return undefined
  const label: unknown = identity.label
  return typeof label === 'string' && label.trim() !== '' ? label : null
}


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
