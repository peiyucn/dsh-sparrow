/**
 * 会话账本取数器：live 走官方投影（同步读，无需缓存）+ 冷会话走 `sessionController.inspect()` 与
 * `foldSessionCredits()` 一次性重放（客户端流式期间反复拉取且要读盘，故缓存 + 单飞）；
 * 两条路径统一输出 `CreditsView`。依赖可注入以便单测，不能只靠人工重启验证冷会话路径。
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSessionCredits, viewOfLedger } from './credits-ledger.js'
import type { CreditLedger, CreditsView } from './credits-ledger.js'

export interface LedgerSources {
  /** live 会话：同步读投影状态；非 live（冷会话 / 投影服务缺失）返回 undefined。 */
  live(sessionId: string): CreditsView | undefined
  /** 冷会话：读持久化事件前缀；返回 undefined 表示该来源不可用（如非 web profile 下 `sessionController` 缺失）。 */
  inspect(sessionId: string): Promise<readonly SessionEvent[] | undefined>
}

export interface LedgerResolverOptions {
  /** 冷路径缓存会话上限（LRU 淘汰最旧）。 */
  maxCached?: number
}

export interface LedgerResolver {
  /** 解析某会话的积分读面；两条来源都拿不到时返回 undefined。 */
  for(sessionId: string): Promise<CreditsView | undefined>
  /** 仅同步的 live 读（投影状态已就绪时零 IO）；冷会话返回 undefined。 */
  liveOf(sessionId: string): CreditsView | undefined
  /** 当前冷路径缓存条目数（测试与诊断用）。 */
  readonly size: number
}

const DEFAULT_MAX_CACHED = 64

/** 造一个积分取数器：live（投影）优先，冷会话走 `inspect` 且同一会话并发**单飞**；
 * `inspect` 抛错或返回 undefined 时退回缓存（可能是上一次冷读的结果）。 */
export function createLedgerResolver(
  sources: LedgerSources,
  options: LedgerResolverOptions = {},
): LedgerResolver {
  const maxCached = options.maxCached ?? DEFAULT_MAX_CACHED
  const cache = new Map<string, CreditLedger>()
  const inflight = new Map<string, Promise<CreditsView | undefined>>()

  function remember(sessionId: string, ledger: CreditLedger): void {
    // 覆盖写会让 Map 保持旧插入位，主动 delete 再 set 才有 LRU 语义。
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
      // ⚠️ **live 读也必须包在 try 里**：`sources.live` 调的宿主服务缺失时表现为「拿到 ctx 但取服务抛错」，
      // 异常穿出会经 web 路由兜底 catch 原样回给浏览器；按《扩展与宿主兼容·运行期不冒泡》失败即降级。
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
          // 会话不存在 / 持久化读失败：退回缓存，不阻塞展示。
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
