/**
 * 会话账本取数器：把「live / 冷会话」两条来源与缓存、单飞策略收在一个可注入依赖的
 * 小件里——**便于单测**（重启后的冷会话路径是本模块存在的主要理由，不能只靠人工重启验证）。
 *
 * ## 两条来源的分工（0.1.7 迁移后）
 *
 * * **live**：官方投影注册表（`ctx.sessionProjections`）已按事件维护好本 provider 的
 *   积分状态，`live()` 只是**同步读一下当前状态**——不再读会话历史，因此**不需要缓存、
 *   不需要增量折叠**（框架逐事件驱动，天然只吃新事件）。
 * * **冷会话**（重启后未激活，没有 live `Session` 对象）：走
 *   `sessionController.inspect()` 读持久化前缀 + `foldSessionCredits()` 一次性重放。
 *   这条路径仍保留缓存与单飞——客户端在流式期间按去抖反复拉取，冷读要读盘，
 *   不缓存/不单飞会把磁盘打满。
 *
 * 两条路径的**输出形状统一**为 `CreditsView`，上层对数据来源无感。
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSessionCredits, viewOfLedger } from './credits-ledger.js'
import type { CreditLedger, CreditsView } from './credits-ledger.js'

/** 账本的两条取数来源。 */
export interface LedgerSources {
  /**
   * live 会话：同步读投影状态；非 live（冷会话 / 投影服务缺失）返回 undefined。
   * @param sessionId - 会话 id。
   */
  live(sessionId: string): CreditsView | undefined
  /**
   * 冷会话：读持久化事件前缀。返回 undefined 表示该来源不可用
   * （如非 web profile 下 sessionController 缺失）。
   */
  inspect(sessionId: string): Promise<readonly SessionEvent[] | undefined>
}

/** 取数器配置。 */
export interface LedgerResolverOptions {
  /** 冷路径缓存会话上限（LRU 淘汰最旧）。 */
  maxCached?: number
}

/** 取数器读面。 */
export interface LedgerResolver {
  /** 解析某会话的积分读面；两条来源都拿不到时返回 undefined。 */
  for(sessionId: string): Promise<CreditsView | undefined>
  /** 仅同步的 live 读（投影状态已就绪时零 IO）；冷会话返回 undefined。 */
  liveOf(sessionId: string): CreditsView | undefined
  /** 当前冷路径缓存条目数（测试与诊断用）。 */
  readonly size: number
}

const DEFAULT_MAX_CACHED = 64

/**
 * 造一个积分取数器。
 *
 * live（投影）优先；冷会话走 `inspect`。同一会话的并发冷读**单飞**。
 * `inspect` 抛错或返回 undefined 时退回缓存（可能是上一次冷读的结果）。
 *
 * @param sources - 两条取数来源。
 * @param options - 冷路径缓存上限。
 * @returns 取数器。
 */
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
      // ⚠️ **live 读也必须包在 try 里**：`sources.live` 会调宿主面
      // （`ctx.sessionProjections.stateOf()`）。该服务在组合里缺失时表现为
      // 「能拿到 ctx、但取服务抛错 / 方法不存在」，`liveOf` 直接抛 `TypeError`。
      // 异常若穿出 `for()` 会到 web 路由的兜底 catch，把内部 TypeError 原样回给浏览器
      // （历史事故：HTTP 400 带 `s.snapshotEvents is not a function` 文案），插件则继续带病运行。
      // 按根规范《扩展与宿主兼容·运行期不冒泡》：自有入口内部兜住异常、失败即降级
      // ——live 读不可用就当冷会话处理（走 inspect / 退回缓存）。
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
