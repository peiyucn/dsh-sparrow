/**
 * Cold-session projection row seeding: shared by trash-restore finalization and startup repair.
 *
 * Why it is needed: projection rows are the **only** source of titles / subagent labels in the `@` list (the
 * official `cachedSnapshot` reads only persisted checkpoints and does not fold logs on the fly). Sessions in the
 * trash are not in the persistence list, and historically the startup sweep deleted their rows as stale data;
 * after restore, the input-box `@` degraded to a bare session id and the task-board `@` degraded to the project
 * directory name (observed 2026-11-08: all three restored subagent rows were missing).
 * The fix has two layers: ① the sweep no longer deletes rows for trashed sessions (see projection.ts);
 * ② this module rebuilds missing rows through the official public `coldSnapshot` write-back surface (covering
 * existing data already deleted before the fix), and re-emits `api-session/added` after restore (with a cached
 * projection block), so the client session list shows titles without a refresh.
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

/** Facts immediately available after seeding one session (source for the added notification payload). */
interface SessionProjectionFacts {
  readonly header: SessionHeader
  readonly blank: boolean
  /** Official cached projection block; absent means the cache service is unavailable / seeding failed, so the
   *  added notification can add the entry but not the title. */
  readonly projections?: ProjectionBlock
}

/**
 * Whether a cached row lacks a unit the `@` list needs: the title (without label it degrades to the session id),
 * and, for subagent sessions, the subagent label unit (without composer's displayTitle it degrades to the session
 * id). A row that exists but lacks a unit still needs seeding.
 */
function needsProjectionSeed(header: SessionHeader, block: ProjectionBlock | undefined): boolean {
  if (block === undefined) return true
  const title = block.values.title
  if (typeof title !== 'string' || title.trim() === '') return true
  return header.origin === 'subagent' && block.values.subagent === undefined
}

/** Projection values → blank determination (same criteria as parseBlankProjection: sessionListMetadata.blank or turns === 0). */
function blankOf(ctx: Context, sessionId: string, block: ProjectionBlock | undefined): boolean {
  if (block !== undefined) {
    const metadata = block.values.sessionListMetadata as { readonly blank?: unknown } | undefined
    if (metadata?.blank === true) return true
    const stats = block.values.sessionStats as { readonly turns?: unknown } | undefined
    if (stats?.turns === 0) return true
  }
  return readStrayBlankness(ctx, sessionId)
}

/** Fallback when seeding fails: keep the existing cached block (possibly empty) so a derived-data failure does
 *  not affect the main restore flow. */
function degraded(header: SessionHeader, projections: ProjectionBlock | undefined, blank: boolean): SessionProjectionFacts {
  return { header, blank, ...projections === undefined ? {} : { projections } }
}

/**
 * Seed one session: when its row is already usable, do not read the log; when the row is missing / incomplete,
 * read the full cold log and write back through the official `coldSnapshot`.
 * Any failure only logs a warning and degrades; nothing is thrown to the caller.
 * @param ctx - Host context.
 * @param id - Session id.
 * @param signal - Abort signal for the batch budget.
 * @returns Seeded facts; undefined when the session is not in persistence / even the header cannot be obtained.
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
  // The cache service has no write-back surface at all: reading a log would not write anything, so degrade
  // immediately — avoid folding a large log for every session for nothing.
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
 * Seed projection rows in batches (bounded concurrency + batch budget).
 * @param ctx - Host context.
 * @param sessionIds - Session ids to seed (deduplicated, input order preserved).
 * @param budgetMs - Batch budget; unfinished items after timeout are treated as failed, leaving the rest for the
 * next startup repair.
 * @returns Facts for sessions whose headers were obtained (in input order).
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
 * Restore finalization: seed projection rows and re-emit `api-session/added` in input order "root → children".
 *
 * Restored sessions are still archived (trash entries came from the archived set), so added only makes the
 * client session list hold them again (removed was emitted when they entered the trash); archived state is
 * determined by the workspace snapshot. The cached projection block is included so titles / subagent labels are
 * immediately available — that is why the two `@` lists agree.
 * @param ctx - Host context.
 * @param sessionIds - Restored session ids (roots first, children after).
 * @param budgetMs - Seeding budget.
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
 * Startup repair: seed projection rows for cold sessions in the persistence list that lack them (covering stock
 * data swept away while in the trash before the fix).
 *
 * Only non-live sessions are handled (live sessions use the projection registry snapshot and do not need cached
 * rows); logs are read only for sessions that genuinely lack a row, so on a healthy machine this is a zero-I/O
 * walk. After seeding, added is emitted so connected pages recover titles without a refresh.
 * @param ctx - Host context.
 * @param headerFacts - Header facts cache (persistence list, prewarmed by the startup sweep).
 */
export async function healMissingSessionProjections(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<void> {
  // No official write-back surface: seeding cannot succeed, so do not read logs for every cold session for
  // nothing (old hosts / when the service is not mounted).
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
