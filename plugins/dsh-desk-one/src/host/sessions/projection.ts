

import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import {
  parseBlankProjection, parseSessionFacts, type HeaderFactsStore, type SessionFacts,
} from './archive.js'
import {
  PACKAGE_NAME, PROJECTION_CACHE_DOMAIN_FALLBACK, PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE, PROJECTION_CACHE_INVALIDATE_ATTEMPTS,
  projectionCacheDomainOf, type ProjectionCacheDomain,
} from './constants.js'
import type { HeaderFacts } from './headers.js'


let projectionCacheDomain: ProjectionCacheDomain = PROJECTION_CACHE_DOMAIN_FALLBACK

export async function resolveProjectionCacheDomain(): Promise<void> {
  try {
    const surface = await import(PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE)
    projectionCacheDomain = projectionCacheDomainOf((surface as { projectionCacheDomainSpec?: unknown }).projectionCacheDomainSpec)
  } catch {

  }
}




interface ProjectionCacheLike {
  readonly cachedSnapshot?: (...args: unknown[]) => unknown
  readonly coldSnapshot?: (...args: unknown[]) => unknown
}


export interface ProjectionBlock {
  readonly asOfSeq: number
  readonly values: Record<string, unknown>
}

function projectionCacheService(ctx: Context): ProjectionCacheLike | undefined {
  return ctx.get('sessionProjectionCache') as unknown as ProjectionCacheLike | undefined
}


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
    ctx.logger.warn(`${PACKAGE_NAME}: 投影缓存读取失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}


export function coldSnapshotOf(
  ctx: Context,
  header: SessionHeader,
  inheritedEventCount: unknown,
  events: readonly unknown[],
): ProjectionBlock | undefined {
  const cache = projectionCacheService(ctx)
  const fn = cache?.coldSnapshot

  if (typeof fn !== 'function' || fn.length < 3) return undefined
  try {
    return projectionBlockOf(fn.call(cache, header, inheritedEventCount, events))
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: 投影缓存回填失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}


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


export function canWriteProjectionCache(ctx: Context): boolean {
  const fn = projectionCacheService(ctx)?.coldSnapshot
  return typeof fn === 'function' && fn.length >= 3
}


function readProjectionRow(ctx: Context, sessionId: string): unknown {
  try {
    return ctx.storageDomain.get(projectionCacheDomain.name)?.table(projectionCacheDomain.table).get(sessionId)
  } catch {
    return undefined
  }
}


export function sessionFacts(ctx: Context, sessionId: string): SessionFacts | undefined {
  return parseSessionFacts(readProjectionRow(ctx, sessionId))
}


export function readStrayBlankness(ctx: Context, sessionId: string): boolean {
  return parseBlankProjection(readProjectionRow(ctx, sessionId))?.blank === true
}


async function invalidateProjectionCache(ctx: Context, sessionId: string): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(projectionCacheDomain.name)
    if (domain === undefined) return
    await domain.table(projectionCacheDomain.table).delete(sessionId)
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: 投影缓存失效失败（${sessionId}）：${error instanceof Error ? error.message : String(error)}`)
  }
}


export async function invalidateProjectionCacheGuarded(ctx: Context, sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < PROJECTION_CACHE_INVALIDATE_ATTEMPTS; attempt++) {
    await invalidateProjectionCache(ctx, sessionId)
    try {
      const domain = ctx.storageDomain.get(projectionCacheDomain.name)
      if (domain === undefined || domain.table(projectionCacheDomain.table).get(sessionId) === undefined) return
    } catch (error) {
      ctx.logger.warn(`${PACKAGE_NAME}: 投影缓存校验失败（${sessionId}）：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (attempt === PROJECTION_CACHE_INVALIDATE_ATTEMPTS - 1) {
      ctx.logger.warn(`${PACKAGE_NAME}: 移入回收站/删除后投影缓存仍残留 ${sessionId}，重启后启动清扫会再次清理`)
    }
  }
}


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
    if (removed > 0) ctx.logger.warn(`${PACKAGE_NAME}: 启动清扫投影缓存移除 ${removed} 个陈旧会话`)
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: 投影缓存启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
