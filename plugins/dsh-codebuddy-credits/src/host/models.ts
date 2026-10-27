/**
 * 模型事实：进程内缓存（不落设置节），完全由 Key 授权下的 /v3/config 填充。
 * 自动刷新带 60s 冷却、手动刷新绕过冷却；两条路径共用上游单飞，避免并发重复拉目录。
 * 事实有变化才让 provider 重提交 route（= 一次 llm/adapters-updated），不触碰其他 provider。
 */

import type { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { fetchCodeBuddyModels, factsFromEntries } from '../catalog.js'
import type { CodeBuddyModelEntry, CodeBuddyModelFacts } from '../catalog.js'
import { MODEL_REFRESH_COOLDOWN_MS } from '../constants.js'
import type { CodeBuddyAccount } from './account.js'

/** route 控制面（provider.ts 提供；晚绑定断开 models ↔ provider 的构造环）。 */
export interface ModelRoutes {
  isRegistered(): boolean
  /** 同一 route 集重提交：宿主重建模型目录、打开中的选择器拿到新列表。 */
  republish(): void
  ensureRegistered(): void
}

export interface ModelFactsStore {
  list(): readonly CodeBuddyModelFacts[]
  /** save / reapply 落定：直接替换事实（代际由调用方先行自增）。 */
  set(entries: readonly CodeBuddyModelEntry[]): void
  reset(): void
  /** /status 自愈入口：目录为空时触发一次节流后台补拉。 */
  ensure(): void
  /** 宿主建目录触发的后台刷新（受冷却与单飞约束）。 */
  kick(): void
  /** 设置卡「获取可用模型」：绕过冷却，复用上游单飞。 */
  refreshManually(): Promise<{ changed: boolean; models: readonly CodeBuddyModelFacts[] }>
  bindRoutes(routes: ModelRoutes): void
}

export interface ModelFactsOptions {
  ctx: Context
  name: string
  resolveApiKey(): Promise<string>
  /** 凭据/授权代际：异步刷新在发起时捕获，落定前不一致即丢弃。 */
  generation(): number
  account(): CodeBuddyAccount | undefined
}

/** 两代事实是否等价（模型 id/展示名/输入模态/思考档位）。 */
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

  /** 上游拉取的单飞：自动与手动两条路径共用。 */
  function loadFactsOnce(key: string): Promise<readonly CodeBuddyModelFacts[]> {
    if (factsInFlight === undefined) {
      factsInFlight = refreshFactsWithKey(key).finally(() => { factsInFlight = undefined })
    }
    return factsInFlight
  }

  function republishIfChanged(changed: boolean): void {
    if (changed && routes?.isRegistered() === true) routes.republish()
  }

  /** 节流后台刷新：失败保持现状（下次建目录再试），成功且有变化即通知选择器。 */
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
      // 凭据/授权已变化：这次结果属于旧状态，直接丢弃。
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
      // 刷新期间凭据被换掉/清空：结果已过期，既不能覆盖新状态，也不能据此注册 route。
      if (generation !== options.generation()) {
        throw new LlmError(`${options.name}: 凭据在刷新期间发生变化，请稍后重试`, 'REFRESH_SUPERSEDED')
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
