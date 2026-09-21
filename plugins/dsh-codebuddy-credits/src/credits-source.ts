/**
 * 会话账本取数器：把「live 内存日志 / 冷会话持久化前缀」两条来源与缓存、
 * 单飞策略收在一个可注入依赖的小件里——**便于单测**（重启后的冷会话路径是本
 * 模块存在的主要理由，不能只靠人工重启验证）。
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSessionCredits } from './credits-ledger.js'
import type { CreditLedger } from './credits-ledger.js'

/** 账本的两条取数来源。 */
export interface LedgerSources {
  /**
   * live 会话：同步读内存日志；非 live（冷会话）返回 undefined。
   * @param sessionId - 会话 id。
   * @param cached - 已缓存账本（用于**增量折叠**，只折新增事件）；无缓存时为 undefined。
   */
  live(sessionId: string, cached: CreditLedger | undefined): CreditLedger | undefined
  /**
   * 冷会话：读持久化事件前缀。返回 undefined 表示该来源不可用
   * （如非 web profile 下 sessionController 缺失）。
   */
  inspect(sessionId: string): Promise<readonly SessionEvent[] | undefined>
}

/** 取数器配置。 */
export interface LedgerResolverOptions {
  /** 缓存会话上限（LRU 淘汰最旧）。 */
  maxCached?: number
}

/** 取数器读面。 */
export interface LedgerResolver {
  /** 解析某会话的账本；两条来源都拿不到时返回 undefined。 */
  for(sessionId: string): Promise<CreditLedger | undefined>
  /** 仅同步的 live 读（命中内存日志时零 IO）；冷会话返回 undefined。 */
  liveOf(sessionId: string): CreditLedger | undefined
  /** 当前缓存条目数（测试与诊断用）。 */
  readonly size: number
}

const DEFAULT_MAX_CACHED = 64

/**
 * 造一个账本取数器。
 *
 * live 优先；冷会话走 `inspect`。同一会话的并发冷读**单飞**（客户端在流式期间
 * 会按去抖反复拉取，冷路径要读持久化，不单飞会把磁盘打满）。
 * `inspect` 抛错或返回 undefined 时退回缓存（可能是上一次 live 读的结果）。
 *
 * @param sources - 两条取数来源。
 * @param options - 缓存上限。
 * @returns 取数器。
 */
export function createLedgerResolver(
  sources: LedgerSources,
  options: LedgerResolverOptions = {},
): LedgerResolver {
  const maxCached = options.maxCached ?? DEFAULT_MAX_CACHED
  const cache = new Map<string, CreditLedger>()
  const inflight = new Map<string, Promise<CreditLedger | undefined>>()

  function remember(sessionId: string, ledger: CreditLedger): void {
    // 覆盖写会让 Map 保持旧插入位，主动 delete 再 set 才有 LRU 语义。
    cache.delete(sessionId)
    cache.set(sessionId, ledger)
    if (cache.size > maxCached) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
  }

  function liveOf(sessionId: string): CreditLedger | undefined {
    const ledger = sources.live(sessionId, cache.get(sessionId))
    if (ledger !== undefined) remember(sessionId, ledger)
    return ledger
  }

  return {
    liveOf,
    get size() { return cache.size },
    async for(sessionId: string): Promise<CreditLedger | undefined> {
      const live = liveOf(sessionId)
      if (live !== undefined) return live

      const ongoing = inflight.get(sessionId)
      if (ongoing !== undefined) return ongoing

      const read = (async (): Promise<CreditLedger | undefined> => {
        try {
          const events = await sources.inspect(sessionId)
          if (events === undefined) return cache.get(sessionId)
          const ledger = foldSessionCredits(events, cache.get(sessionId))
          remember(sessionId, ledger)
          return ledger
        } catch {
          // 会话不存在 / 持久化读失败：退回缓存，不阻塞展示。
          return cache.get(sessionId)
        } finally {
          inflight.delete(sessionId)
        }
      })()
      inflight.set(sessionId, read)
      return read
    },
  }
}
