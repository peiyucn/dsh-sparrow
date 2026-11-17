

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSessionCredits, viewOfLedger } from './credits-ledger.js'
import type { CreditLedger, CreditsView } from './credits-ledger.js'

export interface LedgerSources {

  live(sessionId: string): CreditsView | undefined

  inspect(sessionId: string): Promise<readonly SessionEvent[] | undefined>
}

export interface LedgerResolverOptions {

  maxCached?: number
}

export interface LedgerResolver {

  for(sessionId: string): Promise<CreditsView | undefined>

  liveOf(sessionId: string): CreditsView | undefined

  readonly size: number
}

const DEFAULT_MAX_CACHED = 64


export function createLedgerResolver(
  sources: LedgerSources,
  options: LedgerResolverOptions = {},
): LedgerResolver {
  const maxCached = options.maxCached ?? DEFAULT_MAX_CACHED
  const cache = new Map<string, CreditLedger>()
  const inflight = new Map<string, Promise<CreditsView | undefined>>()

  function remember(sessionId: string, ledger: CreditLedger): void {

    cache.delete(sessionId)
    cache.set(sessionId, ledger)
    if (cache.size > maxCached) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
  }

  function liveOf(sessionId: string): CreditsView | undefined {
    return sources.live(sessionId)
  }

  return {
    liveOf,
    get size() { return cache.size },
    async for(sessionId: string): Promise<CreditsView | undefined> {


      let live: CreditsView | undefined
      try {
        live = liveOf(sessionId)
      } catch {
        live = undefined
      }
      if (live !== undefined) return live

      const ongoing = inflight.get(sessionId)
      if (ongoing !== undefined) return ongoing

      const read = (async (): Promise<CreditsView | undefined> => {
        try {
          const events = await sources.inspect(sessionId)
          const cached = cache.get(sessionId)
          if (events === undefined) return cached === undefined ? undefined : viewOfLedger(cached)
          const ledger = foldSessionCredits(events, cached)
          remember(sessionId, ledger)
          return viewOfLedger(ledger)
        } catch {

          const cached = cache.get(sessionId)
          return cached === undefined ? undefined : viewOfLedger(cached)
        } finally {
          inflight.delete(sessionId)
        }
      })()
      inflight.set(sessionId, read)
      return read
    },
  }
}
