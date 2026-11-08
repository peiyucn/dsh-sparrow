/**
 * 冷会话投影行回填：回收站还原收尾与启动修复共用。
 *
 * 为什么需要：投影行是 `@` 列表显示标题 / 子会话标签的**唯一**来源（官方 `cachedSnapshot` 只读
 * 持久化检查点，不现折日志）。回收站里的会话不在持久化清单里，历史上启动清扫会把它们的行当
 * 陈旧数据删掉；还原后输入框 `@` 退化成裸 session id、任务板 `@` 退化成项目目录名
 * （2026-11-08 实测：还原的 3 个子会话行全部缺失）。
 * 修法分两层：① 清扫不再删回收站会话的行（见 projection.ts）；② 本模块按官方公开的
 * `coldSnapshot` 写回面重建缺失行（覆盖修复前已经被删掉的存量数据），并在还原后补发
 * `api-session/added`（带 cached 投影块），让客户端会话列表无需刷新即可显示标题。
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { readColdSessionLog } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import { createBudgetSignal, runBounded, type HeaderFactsStore } from './archive.js'
import {
  PROJECTION_SEED_BUDGET_MS, TITLE_FOLD_CONCURRENCY,
} from './constants.js'
import { emitSessionAdded } from './archive-set.js'
import type { HeaderFacts } from './headers.js'
import { cachedSnapshotOf, canWriteProjectionCache, coldSnapshotOf, readStrayBlankness, summaryBlockOf, type ProjectionBlock } from './projection.js'

/** 一条会话回填后立即可用的事实（added 通知载荷来源）。 */
interface SessionProjectionFacts {
  readonly header: SessionHeader
  readonly blank: boolean
  /** 官方 cached 投影块；缺省表示缓存服务不可用 / 回填失败，added 通知只能补条目、补不了标题。 */
  readonly projections?: ProjectionBlock
}

/**
 * 缓存行是否缺了 `@` 列表需要的单元：标题（缺了 label 退化成 session id），以及子会话的
 * subagent 标签单元（缺了 composer 的 displayTitle 退化成 session id）。行存在但单元缺失同样要回填。
 */
function needsProjectionSeed(header: SessionHeader, block: ProjectionBlock | undefined): boolean {
  if (block === undefined) return true
  const title = block.values.title
  if (typeof title !== 'string' || title.trim() === '') return true
  return header.origin === 'subagent' && block.values.subagent === undefined
}

/** 投影值 → 空白判定（与 parseBlankProjection 同口径：sessionListMetadata.blank 或 turns === 0）。 */
function blankOf(ctx: Context, sessionId: string, block: ProjectionBlock | undefined): boolean {
  if (block !== undefined) {
    const metadata = block.values.sessionListMetadata as { readonly blank?: unknown } | undefined
    if (metadata?.blank === true) return true
    const stats = block.values.sessionStats as { readonly turns?: unknown } | undefined
    if (stats?.turns === 0) return true
  }
  return readStrayBlankness(ctx, sessionId)
}

/** 回填失败时的降级：保留已有缓存块（可能为空），不因为派生数据失败影响还原主流程。 */
function degraded(header: SessionHeader, projections: ProjectionBlock | undefined, blank: boolean): SessionProjectionFacts {
  return { header, blank, ...projections === undefined ? {} : { projections } }
}

/**
 * 回填单条会话：行已可用时不读日志；缺失 / 单元不全时读完整冷日志并走官方 `coldSnapshot` 写回。
 * 任何失败只告警并降级，不向调用方抛错。
 * @param ctx - 宿主上下文。
 * @param id - 会话 id。
 * @param signal - 整批预算的中止信号。
 * @returns 回填后事实；会话不在持久化 / 连 header 都拿不到时 undefined。
 */
async function seedOneSession(
  ctx: Context,
  id: string,
  signal: AbortSignal,
): Promise<SessionProjectionFacts | undefined> {
  const sessionId = SessionId(id)
  let header: SessionHeader
  try {
    const stored = await ctx.sessionPersistence.stat(sessionId, { signal })
    if (stored === undefined) return undefined
    header = stored.header
  } catch (error) {
    if (!signal.aborted) {
      ctx.logger.warn(`dsh-archive-manage: 读取会话事实失败（${id}）：${error instanceof Error ? error.message : String(error)}`)
    }
    return undefined
  }
  const cached = cachedSnapshotOf(ctx, header)
  const cachedProjections = summaryBlockOf(ctx, cached)
  if (!needsProjectionSeed(header, cached)) {
    return { header, blank: blankOf(ctx, id, cached), projections: cachedProjections }
  }
  // 缓存服务连写回面都没有：读日志也写不进去，直接降级——避免为每个会话白折一篇大日志。
  if (!canWriteProjectionCache(ctx)) {
    ctx.logger.warn(`dsh-archive-manage: 宿主未提供可识别的 coldSnapshot，跳过投影行回填（${id}）`)
    return degraded(header, cachedProjections, blankOf(ctx, id, cached))
  }
  let log
  try {
    log = await readColdSessionLog(ctx.sessionPersistence, sessionId, signal)
  } catch (error) {
    if (!signal.aborted) {
      ctx.logger.warn(`dsh-archive-manage: 回填投影行读取冷日志失败（${id}）：${error instanceof Error ? error.message : String(error)}`)
    }
    return degraded(header, cachedProjections, blankOf(ctx, id, cached))
  }
  const seeded = coldSnapshotOf(ctx, log.header, log.inheritedEventCount, log.events)
  if (seeded === undefined) {
    ctx.logger.warn(`dsh-archive-manage: 投影行回填不可用（${id}）：宿主未提供可识别的 coldSnapshot`)
    return degraded(header, cachedProjections, blankOf(ctx, id, cached))
  }
  return { header: log.header, blank: blankOf(ctx, id, seeded), projections: summaryBlockOf(ctx, seeded) }
}

/**
 * 批量回填投影行（有界并发 + 整批预算）。
 * @param ctx - 宿主上下文。
 * @param sessionIds - 待回填会话 id（去重，保持输入顺序）。
 * @param budgetMs - 整批预算；超时后未完成项按失败处理，余量留给下次启动修复。
 * @returns 成功拿到 header 的会话事实（按输入顺序）。
 */
export async function seedSessionProjections(
  ctx: Context,
  sessionIds: readonly string[],
  budgetMs: number = PROJECTION_SEED_BUDGET_MS,
): Promise<Map<string, SessionProjectionFacts>> {
  const out = new Map<string, SessionProjectionFacts>()
  const ids = [...new Set(sessionIds)]
  if (ids.length === 0) return out
  const budget = createBudgetSignal(budgetMs)
  try {
    const results = await runBounded(ids, TITLE_FOLD_CONCURRENCY, async id => {
      if (budget.signal.aborted) return undefined
      return seedOneSession(ctx, id, budget.signal)
    })
    ids.forEach((id, index) => {
      const facts = results[index]
      if (facts !== undefined) out.set(id, facts)
    })
    return out
  } finally {
    budget.release()
  }
}

/**
 * 还原收尾：回填投影行 + 按「根 → 子会话」的输入顺序补发 `api-session/added`。
 *
 * 还原的会话仍处于归档态（回收站条目本来就从归档集来的），所以 added 只是让客户端会话列表
 * 重新持有它们（移入回收站时发过 removed），归档态由 workspace 快照决定；带 cached 投影块
 * 是为了让标题 / 子会话标签立刻可用——两个 `@` 列表因此一致。
 * @param ctx - 宿主上下文。
 * @param sessionIds - 还原的会话 id（根在前、子会话在后）。
 * @param budgetMs - 回填预算。
 */
export async function finalizeRestoredSessions(
  ctx: Context,
  sessionIds: readonly string[],
  budgetMs: number = PROJECTION_SEED_BUDGET_MS,
): Promise<void> {
  const ids = [...new Set(sessionIds)]
  const facts = await seedSessionProjections(ctx, ids, budgetMs)
  for (const id of ids) {
    const entry = facts.get(id)
    if (entry === undefined) {
      ctx.logger.warn(`dsh-archive-manage: 还原后缺少会话事实，跳过 api-session/added（${id}）`)
      continue
    }
    emitSessionAdded(ctx, entry.header, entry.blank, entry.projections)
  }
}

/**
 * 启动修复：持久化清单里缺投影行的冷会话补回（覆盖修复前回收站期间被清扫掉的存量数据）。
 *
 * 只处理非 live 会话（live 会话走投影注册表快照，不需要缓存行）；只对确实缺行的会话读日志，
 * 因此正常机器上是一次零 I/O 的遍历。回填后补发 added，让已连接页面无需刷新就恢复标题。
 * @param ctx - 宿主上下文。
 * @param headerFacts - header 事实缓存（持久化清单，已由启动清扫预热）。
 */
export async function healMissingSessionProjections(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<void> {
  // 没有官方写回面：回填不可能成功，别为整机冷会话白读日志（老宿主 / 服务未挂载时）。
  if (!canWriteProjectionCache(ctx)) return
  try {
    const { headers } = await headerFacts.get()
    const ids = headers
      .filter(header => ctx.sessions.get(SessionId(String(header.id))) === undefined)
      .filter(header => needsProjectionSeed(header, cachedSnapshotOf(ctx, header)))
      .map(header => String(header.id))
    if (ids.length === 0) return
    const facts = await seedSessionProjections(ctx, ids)
    let healed = 0
    for (const entry of facts.values()) {
      if (entry.projections === undefined) continue
      emitSessionAdded(ctx, entry.header, entry.blank, entry.projections)
      healed += 1
    }
    if (healed > 0) ctx.logger.info(`dsh-archive-manage: 回填 ${healed} 个会话的投影行（标题 / 子会话标签恢复）`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 启动投影行回填失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
