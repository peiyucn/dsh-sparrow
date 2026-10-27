/**
 * 官方投影缓存（session_projcache）：域解析、行读取、失效与启动清扫。
 * 投影是派生数据，删除安全；读失败一律按「没有」处理，不让面板因投影异常挂掉。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage-domain'
import {
  parseBlankProjection, parseSessionFacts, type HeaderFactsStore, type SessionFacts,
} from '../archive.js'
import {
  PROJECTION_CACHE_DOMAIN_FALLBACK, PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE, PROJECTION_CACHE_INVALIDATE_ATTEMPTS,
  projectionCacheDomainOf, type ProjectionCacheDomain,
} from '../constants.js'
import type { HeaderFacts } from './headers.js'

/**
 * 官方投影缓存域：移入回收站/删除移走目录后失效对应行，@ 列表不再读到。域名与表名优先
 * 取自官方 `projectionCacheDomainSpec`（官方改名后不需要跟版改代码），取不到才用回退字面量。
 */
let projectionCacheDomain: ProjectionCacheDomain = PROJECTION_CACHE_DOMAIN_FALLBACK

export async function resolveProjectionCacheDomain(): Promise<void> {
  try {
    const surface = await import(PROJECTION_CACHE_DOMAIN_SPEC_PACKAGE)
    projectionCacheDomain = projectionCacheDomainOf((surface as { projectionCacheDomainSpec?: unknown }).projectionCacheDomainSpec)
  } catch {
    // 官方包不在本插件的依赖面内（只存在于宿主安装树），读不到不是错误。
  }
}

/** 读一条投影行（缺失 / 形状异常 / 服务不可用均 undefined）。 */
export function readProjectionRow(ctx: Context, sessionId: string): unknown {
  try {
    return ctx.storageDomain.get(projectionCacheDomain.name)?.table(projectionCacheDomain.table).get(sessionId)
  } catch {
    return undefined
  }
}

/** 会话统计/列表元数据（projcache 行，缺失返回 undefined）。 */
export function sessionFacts(ctx: Context, sessionId: string): SessionFacts | undefined {
  return parseSessionFacts(readProjectionRow(ctx, sessionId))
}

/** 游离会话的「空白」判定：只读官方投影行（与失效投影行同域，见 AGENTS seam 特例）；读失败按非空白保守处理。 */
export function readStrayBlankness(ctx: Context, sessionId: string): boolean {
  return parseBlankProjection(readProjectionRow(ctx, sessionId))?.blank === true
}

/** 失效官方投影缓存行（派生数据，可安全删除；官方服务常驻打开该域，走 get）。 */
async function invalidateProjectionCache(ctx: Context, sessionId: string): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(projectionCacheDomain.name)
    if (domain === undefined) return
    await domain.table(projectionCacheDomain.table).delete(sessionId)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存失效失败（${sessionId}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 移入回收站/删除后校验投影缓存是否已删除；未删除时重试一次并告警，供启动清扫兜底。 */
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

/** 启动清扫：投影缓存中不在 sessionPersistence.list() 里的会话行删除，@ 列表与真实持久化保持一致。 */
export async function sweepStaleProjectionCache(ctx: Context, headerFacts: HeaderFactsStore<HeaderFacts>): Promise<void> {
  try {
    const domain = ctx.storageDomain.get(projectionCacheDomain.name)
    if (domain === undefined) return
    const { headers } = await headerFacts.get()
    const known = new Set(headers.map(header => String(header.id)))
    const table = domain.table(projectionCacheDomain.table)
    let removed = 0
    for (const key of [...table.keys()]) {
      if (known.has(String(key))) continue
      await table.delete(String(key))
      removed++
    }
    if (removed > 0) ctx.logger.warn(`dsh-archive-manage: 启动清扫投影缓存移除 ${removed} 个陈旧会话`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
