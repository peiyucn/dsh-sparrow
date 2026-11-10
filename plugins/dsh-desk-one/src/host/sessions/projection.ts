/**
 * Official projection cache (session_projcache): domain resolution, row reads, invalidation and startup sweep.
 * Projections are derived data and safe to delete; read failures are always treated as "absent", so the panel
 * never breaks because of a projection problem.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import {
  parseBlankProjection, parseSessionFacts, type HeaderFactsStore, type SessionFacts,
} from './archive.js'
import {
  PROJECTION_CACHE_DOMAIN_FALLBACK, PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE, PROJECTION_CACHE_INVALIDATE_ATTEMPTS,
  projectionCacheDomainOf, type ProjectionCacheDomain,
} from './constants.js'
import type { HeaderFacts } from './headers.js'

/**
 * Official projection cache domain: after trashing/deleting moves a directory away, the matching row is
 * invalidated so the @ list no longer reads it. Domain and table names prefer the official
 * `projectionCacheDomainSpec` (so an official rename needs no code change), falling back to literals only
 * when it can't be read.
 */
let projectionCacheDomain: ProjectionCacheDomain = PROJECTION_CACHE_DOMAIN_FALLBACK

export async function resolveProjectionCacheDomain(): Promise<void> {
  try {
    const surface = await import(PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE)
    projectionCacheDomain = projectionCacheDomainOf((surface as { projectionCacheDomainSpec?: unknown }).projectionCacheDomainSpec)
  } catch {
    // The official package is not in this plugin's dependency surface (it only exists in the host install tree), so failing to read it is not an error.
  }
}

/* ------------------------------------------------------------------ *
 * Official projection cache service surface: cachedSnapshot reads (adaptive to two signature versions)
 * and coldSnapshot write-back
 * ------------------------------------------------------------------ */

/** Structural view of the official projection cache service (this plugin doesn't depend on that package's types; it adapts to the parameter count when the official signature changes). */
interface ProjectionCacheLike {
  readonly cachedSnapshot?: (...args: unknown[]) => unknown
  readonly coldSnapshot?: (...args: unknown[]) => unknown
}

/** Official projection block: values are wire values, asOfSeq is the watermark of the sequence space it belongs to (cached blocks take no part in seq comparison). */
export interface ProjectionBlock {
  readonly asOfSeq: number
  readonly values: Record<string, unknown>
}

function projectionCacheService(ctx: Context): ProjectionCacheLike | undefined {
  return ctx.get('sessionProjectionCache') as unknown as ProjectionCacheLike | undefined
}

/** Official snapshot → projection block; a malformed shape is treated as "absent" (a derived-data read failure must not break callers). */
function projectionBlockOf(raw: unknown): ProjectionBlock | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const snapshot = raw as { readonly asOfSeq?: unknown; readonly values?: unknown }
  const values = snapshot.values
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return undefined
  return {
    asOfSeq: typeof snapshot.asOfSeq === 'number' && Number.isFinite(snapshot.asOfSeq) ? snapshot.asOfSeq : 0,
    values: values as Record<string, unknown>,
  }
}

/**
 * Read an official projection cache block (`cachedSnapshot(meta, keys?)`).
 *
 * ⚠️ **The parameter count changed across versions and adapting to it is mandatory** (2026-09-27 production incident):
 * - `0.1.5-rc.3` / `0.1.6-alpha.2`: `(meta, inheritedEventCount, keys?)` — 3 parameters;
 * - **from `0.1.7-rc.1`: `(meta, keys?)`** — the middle parameter was removed, so 2 parameters.
 * With three parameters hardcoded, `keys` actually receives the number `0` ⇒ no unit resolves ⇒ the cache tier
 * misses forever and titles degrade to session ids. `try/catch` cannot cover this: extra arguments don't throw,
 * they are simply ignored, so dispatch on `fn.length` explicitly.
 *
 * This function is the **single entry point** for reading cachedSnapshot in the plugin (titles, subagent labels
 * and projection-row write-back all share it), keeping the three call sites on one definition — changing only
 * one of them makes another silently miss.
 * @param ctx - Host context.
 * @param header - Session header (lifecycle identity).
 * @param keys - Projection units to read; omitted means all.
 * @returns Projection block; undefined when the row is missing / the service is unavailable / the shape is malformed.
 */
export function cachedSnapshotOf(
  ctx: Context,
  header: SessionHeader,
  keys?: readonly string[],
): ProjectionBlock | undefined {
  const cache = projectionCacheService(ctx)
  const fn = cache?.cachedSnapshot
  if (typeof fn !== 'function') return undefined
  try {
    const raw = fn.length >= 3
      ? fn.call(cache, header, 0, keys)
      : fn.call(cache, header, keys)
    return projectionBlockOf(raw)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存读取失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/**
 * Fold a complete cold log and write it back to the official projection cache (`coldSnapshot(meta, inheritedEventCount, events)`).
 *
 * The official write-back is fail-soft and fire-and-forget (a failed write only means the next cold read folds
 * a bit more), so this function returns the current fold result for the caller to use immediately (attaching the
 * cached projection block when re-emitting `added`). This is the official public projection write-back surface:
 * it does not write the storage domain directly and does not copy the official fold logic.
 * @param ctx - Host context.
 * @param header - Cold-log header (must come from the same source as inheritedEventCount and events).
 * @param inheritedEventCount - Length of the event prefix inherited from the fork.
 * @param events - Complete ordered event log.
 * @returns Projection block; undefined when the service is unavailable / the official signature is unrecognized / the fold fails (caller degrades).
 */
export function coldSnapshotOf(
  ctx: Context,
  header: SessionHeader,
  inheritedEventCount: unknown,
  events: readonly unknown[],
): ProjectionBlock | undefined {
  const cache = projectionCacheService(ctx)
  const fn = cache?.coldSnapshot
  // The official code currently takes 3 parameters; fewer parameters means this host line's signature is unrecognized — better to skip the write-back than pass wrong arguments.
  if (typeof fn !== 'function' || fn.length < 3) return undefined
  try {
    return projectionBlockOf(fn.call(cache, header, inheritedEventCount, events))
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存回填失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/**
 * Filter a complete projection block down to the official **summary key set** (same definition as the official
 * cold summary `projectionsFor`): a whole-row projection can be tens of KB (turnOutline / tokenUsage /
 * contextBreakdown and other non-summary units), while `api-session/added` should carry summary keys only.
 * When `summaryKeys` is unavailable (older versions), fall back to the whole block — correctness first.
 * @param ctx - Host context.
 * @param block - Complete projection block.
 * @returns Filtered projection block; an undefined input is returned as-is.
 */
export function summaryBlockOf(ctx: Context, block: ProjectionBlock | undefined): ProjectionBlock | undefined {
  if (block === undefined) return undefined
  const registry = ctx.get('sessionProjections') as unknown as {
    readonly summaryKeys?: () => readonly string[]
  } | undefined
  if (registry === undefined || typeof registry.summaryKeys !== 'function') return block
  try {
    const values: Record<string, unknown> = {}
    for (const key of registry.summaryKeys()) {
      if (Object.hasOwn(block.values, key)) values[key] = block.values[key]
    }
    return { asOfSeq: block.asOfSeq, values }
  } catch {
    return block
  }
}

/** Whether the official projection cache offers a recognizable write-back surface (coldSnapshot currently takes 3 parameters): without it there's no point reading logs for write-back. */
export function canWriteProjectionCache(ctx: Context): boolean {
  const fn = projectionCacheService(ctx)?.coldSnapshot
  return typeof fn === 'function' && fn.length >= 3
}

/** Read one projection row (missing / malformed shape / service unavailable all yield undefined). */
export function readProjectionRow(ctx: Context, sessionId: string): unknown {
  try {
    return ctx.storageDomain.get(projectionCacheDomain.name)?.table(projectionCacheDomain.table).get(sessionId)
  } catch {
    return undefined
  }
}

/** Session stats / list metadata (projcache row; missing returns undefined). */
export function sessionFacts(ctx: Context, sessionId: string): SessionFacts | undefined {
  return parseSessionFacts(readProjectionRow(ctx, sessionId))
}

/** Blankness test for stray sessions: reads only the official projection row (same domain as the invalidated projection rows, see the AGENTS seam exception); read failures are conservatively treated as non-blank. */
export function readStrayBlankness(ctx: Context, sessionId: string): boolean {
  return parseBlankProjection(readProjectionRow(ctx, sessionId))?.blank === true
}

/** Invalidate an official projection cache row (derived data, safe to delete; the official service keeps this domain open, so we go through get). */
async function invalidateProjectionCache(ctx: Context, sessionId: string): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(projectionCacheDomain.name)
    if (domain === undefined) return
    await domain.table(projectionCacheDomain.table).delete(sessionId)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存失效失败（${sessionId}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** After trashing/deleting, verify the projection cache row is gone; retry once and warn when it isn't, with the startup sweep as the backstop. */
export async function invalidateProjectionCacheGuarded(ctx: Context, sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < PROJECTION_CACHE_INVALIDATE_ATTEMPTS; attempt++) {
    await invalidateProjectionCache(ctx, sessionId)
    try {
      const domain = ctx.storageDomain.get(projectionCacheDomain.name)
      if (domain === undefined || domain.table(projectionCacheDomain.table).get(sessionId) === undefined) return
    } catch (error) {
      ctx.logger.warn(`dsh-archive-manage: 投影缓存校验失败（${sessionId}）：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (attempt === PROJECTION_CACHE_INVALIDATE_ATTEMPTS - 1) {
      ctx.logger.warn(`dsh-archive-manage: 移入回收站/删除后投影缓存仍残留 ${sessionId}，重启后启动清扫会再次清理`)
    }
  }
}

/**
 * Startup sweep: delete projection-cache rows for sessions that are neither in the persisted list nor in the
 * trash, keeping the @ list consistent with real persistence.
 *
 * Sessions in the trash (the root plus the child sessions recorded in its sidecar) must be **excluded**: they
 * really aren't in the persisted list, but they are still "restorable sessions", and the projection row is the
 * only source for their title / subagent labels after restore. Sweeping strictly by the persisted list used to
 * delete those rows while the session was in the trash, so after restore the input box's @ degraded to a bare
 * session id and the task board's @ degraded to a project directory name (verified 2026-11-08). On permanent
 * deletion the delete route is responsible for invalidating these rows (see trash.ts).
 * @param ctx - Host context.
 * @param headerFacts - Header facts cache (persisted list).
 * @param preservedIds - Session ids whose projection rows must be kept (restorable sessions in the trash).
 */
export async function sweepStaleProjectionCache(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
  preservedIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(projectionCacheDomain.name)
    if (domain === undefined) return
    const { headers } = await headerFacts.get()
    const known = new Set(headers.map(header => String(header.id)))
    const table = domain.table(projectionCacheDomain.table)
    let removed = 0
    for (const key of [...table.keys()]) {
      const sessionId = String(key)
      if (known.has(sessionId) || preservedIds.has(sessionId)) continue
      await table.delete(sessionId)
      removed++
    }
    if (removed > 0) ctx.logger.warn(`dsh-archive-manage: 启动清扫投影缓存移除 ${removed} 个陈旧会话`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
