

import type { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { fetchCodeBuddyModels, factsFromEntries } from '../catalog.js'
import type { CodeBuddyModelEntry, CodeBuddyModelFacts } from '../catalog.js'
import { MODEL_REFRESH_COOLDOWN_MS } from '../constants.js'
import type { CodeBuddyAccount } from './account.js'


export interface ModelRoutes {
  isRegistered(): boolean

  republish(): void
  ensureRegistered(): void
}

export interface ModelFactsStore {
  list(): readonly CodeBuddyModelFacts[]

  ready(waitMs: number): Promise<void>

  set(entries: readonly CodeBuddyModelEntry[]): void
  reset(): void

  ensure(): void

  kick(): void

  refreshManually(): Promise<{ changed: boolean; models: readonly CodeBuddyModelFacts[] }>
  bindRoutes(routes: ModelRoutes): void
}

export interface ModelFactsOptions {
  ctx: Context
  name: string
  resolveApiKey(): Promise<string>

  generation(): number
  account(): CodeBuddyAccount | undefined
}


function sameFacts(prev: readonly CodeBuddyModelFacts[], next: readonly CodeBuddyModelFacts[]): boolean {
  if (prev.length !== next.length) return false
  return prev.every((entry, index) => {
    const other = next[index]
    return other !== undefined
      && entry.id === other.id
      && entry.name === other.name
      && entry.input.join(',') === other.input.join(',')
      && JSON.stringify(entry.thinkingLevelMap ?? null) === JSON.stringify(other.thinkingLevelMap ?? null)
  })
}

export function createModelFacts(options: ModelFactsOptions): ModelFactsStore {
  let facts: readonly CodeBuddyModelFacts[] = []
  let lastRefreshAttemptAt = 0
  let refreshInFlight: Promise<void> | undefined
  let factsInFlight: Promise<readonly CodeBuddyModelFacts[]> | undefined
  let routes: ModelRoutes | undefined

  async function refreshFactsWithKey(key: string): Promise<readonly CodeBuddyModelFacts[]> {
    return factsFromEntries(await fetchCodeBuddyModels(key, options.account()))
  }


  function loadFactsOnce(key: string): Promise<readonly CodeBuddyModelFacts[]> {
    if (factsInFlight === undefined) {
      factsInFlight = refreshFactsWithKey(key).finally(() => { factsInFlight = undefined })
    }
    return factsInFlight
  }

  function republishIfChanged(changed: boolean): void {
    if (changed && routes?.isRegistered() === true) routes.republish()
  }


  async function refreshInBackground(): Promise<void> {
    const generation = options.generation()
    let key: string
    try {
      key = await options.resolveApiKey()
    } catch {
      return
    }
    try {
      const next = await loadFactsOnce(key)

      if (generation !== options.generation()) return
      const changed = !sameFacts(facts, next)
      facts = next
      republishIfChanged(changed)
    } catch (error) {
      options.ctx.logger.warn(`${options.name}: 后台模型目录刷新失败`)
      options.ctx.logger.warn(error)
    }
  }

  function kick(): void {
    if (refreshInFlight !== undefined) return
    const now = Date.now()
    if (now - lastRefreshAttemptAt < MODEL_REFRESH_COOLDOWN_MS) return
    lastRefreshAttemptAt = now
    refreshInFlight = refreshInBackground().finally(() => {
      refreshInFlight = undefined
    })
  }

  return {
    list: () => facts,
    async ready(waitMs) {
      if (facts.length > 0) return
      kick()
      const pending = refreshInFlight
      if (pending === undefined) return
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          pending.catch(() => {}),
          new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs) }),
        ])
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    },
    set(entries) {
      facts = factsFromEntries(entries)
    },
    reset() {
      facts = []
    },
    ensure() {
      if (facts.length === 0) kick()
    },
    kick,
    async refreshManually() {
      const generation = options.generation()
      const key = await options.resolveApiKey()
      const next = await loadFactsOnce(key)

      if (generation !== options.generation()) {
        throw LlmError.fromFailure({ message: `${options.name}: 凭据在刷新期间发生变化，请稍后重试`, code: 'REFRESH_SUPERSEDED' })
      }
      const changed = !sameFacts(facts, next)
      facts = next
      lastRefreshAttemptAt = Date.now()
      republishIfChanged(changed)
      if (routes?.isRegistered() !== true) routes?.ensureRegistered()
      return { changed, models: next }
    },
    bindRoutes(next) {
      routes = next
    },
  }
}
