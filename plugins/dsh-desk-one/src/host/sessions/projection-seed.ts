

import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { readColdSessionLog } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import { createBudgetSignal, runBounded, type HeaderFactsStore } from './archive.js'
import {
  PACKAGE_NAME, PROJECTION_SEED_BUDGET_MS, TITLE_FOLD_CONCURRENCY,
} from './constants.js'
import { emitSessionAdded } from './archive-set.js'
import type { HeaderFacts } from './headers.js'
import { cachedSnapshotOf, canWriteProjectionCache, coldSnapshotOf, readStrayBlankness, summaryBlockOf, type ProjectionBlock } from './projection.js'


interface SessionProjectionFacts {
  readonly header: SessionHeader
  readonly blank: boolean

  readonly projections?: ProjectionBlock
}


function needsProjectionSeed(header: SessionHeader, block: ProjectionBlock | undefined): boolean {
  if (block === undefined) return true
  const title = block.values.title
  if (typeof title !== 'string' || title.trim() === '') return true
  return header.origin === 'subagent' && block.values.subagent === undefined
}


function blankOf(ctx: Context, sessionId: string, block: ProjectionBlock | undefined): boolean {
  if (block !== undefined) {
    const metadata = block.values.sessionListMetadata as { readonly blank?: unknown } | undefined
    if (metadata?.blank === true) return true
    const stats = block.values.sessionStats as { readonly turns?: unknown } | undefined
    if (stats?.turns === 0) return true
  }
  return readStrayBlankness(ctx, sessionId)
}


function degraded(header: SessionHeader, projections: ProjectionBlock | undefined, blank: boolean): SessionProjectionFacts {
  return { header, blank, ...projections === undefined ? {} : { projections } }
}


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
      ctx.logger.warn(`${PACKAGE_NAME}: 读取会话事实失败（${id}）：${error instanceof Error ? error.message : String(error)}`)
    }
    return undefined
  }
  const cached = cachedSnapshotOf(ctx, header)
  const cachedProjections = summaryBlockOf(ctx, cached)
  if (!needsProjectionSeed(header, cached)) {
    return { header, blank: blankOf(ctx, id, cached), projections: cachedProjections }
  }


  if (!canWriteProjectionCache(ctx)) {
    ctx.logger.warn(`${PACKAGE_NAME}: 宿主未提供可识别的 coldSnapshot，跳过投影行回填（${id}）`)
    return degraded(header, cachedProjections, blankOf(ctx, id, cached))
  }
  let log
  try {
    log = await readColdSessionLog(ctx.sessionPersistence, sessionId, signal)
  } catch (error) {
    if (!signal.aborted) {
      ctx.logger.warn(`${PACKAGE_NAME}: 回填投影行读取冷日志失败（${id}）：${error instanceof Error ? error.message : String(error)}`)
    }
    return degraded(header, cachedProjections, blankOf(ctx, id, cached))
  }
  const seeded = coldSnapshotOf(ctx, log.header, log.inheritedEventCount, log.events)
  if (seeded === undefined) {
    ctx.logger.warn(`${PACKAGE_NAME}: 投影行回填不可用（${id}）：宿主未提供可识别的 coldSnapshot`)
    return degraded(header, cachedProjections, blankOf(ctx, id, cached))
  }
  return { header: log.header, blank: blankOf(ctx, id, seeded), projections: summaryBlockOf(ctx, seeded) }
}


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
      ctx.logger.warn(`${PACKAGE_NAME}: 还原后缺少会话事实，跳过 api-session/added（${id}）`)
      continue
    }
    emitSessionAdded(ctx, entry.header, entry.blank, entry.projections)
  }
}


export async function healMissingSessionProjections(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<void> {


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
    if (healed > 0) ctx.logger.info(`${PACKAGE_NAME}: 回填 ${healed} 个会话的投影行（标题 / 子会话标签恢复）`)
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: 启动投影行回填失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
