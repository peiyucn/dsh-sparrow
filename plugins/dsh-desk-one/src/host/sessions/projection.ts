/**
 * 官方投影缓存（session_projcache）：域解析、行读取、失效与启动清扫。
 * 投影是派生数据，删除安全；读失败一律按「没有」处理，不让面板因投影异常挂掉。
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

/* ------------------------------------------------------------------ *
 * 官方投影缓存服务面：cachedSnapshot 读（两版本形参自适应）与 coldSnapshot 写回
 * ------------------------------------------------------------------ */

/** 官方投影缓存服务的结构化面（本插件不依赖该包类型；官方改签名时按形参个数自适应）。 */
interface ProjectionCacheLike {
  readonly cachedSnapshot?: (...args: unknown[]) => unknown
  readonly coldSnapshot?: (...args: unknown[]) => unknown
}

/** 官方投影块：values 是 wire 值，asOfSeq 是所属序列空间的 watermark（cached 块不参与 seq 比较）。 */
export interface ProjectionBlock {
  readonly asOfSeq: number
  readonly values: Record<string, unknown>
}

function projectionCacheService(ctx: Context): ProjectionCacheLike | undefined {
  return ctx.get('sessionProjectionCache') as unknown as ProjectionCacheLike | undefined
}

/** 官方快照 → 投影块；形状异常按「没有」处理（派生数据读失败不让调用方挂掉）。 */
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
 * 读官方投影缓存块（`cachedSnapshot(meta, keys?)`）。
 *
 * ⚠️ **形参个数跨版本变过，必须按形参个数自适应**（2026-09-27 真机事故）：
 * - `0.1.5-rc.3` / `0.1.6-alpha.2`：`(meta, inheritedEventCount, keys?)` —— 3 参；
 * - **`0.1.7-rc.1` 起：`(meta, keys?)`** —— 中间参数被删，变 2 参。
 * 写死三参时 `keys` 实收数字 `0` ⇒ 取不到任何单元 ⇒ 缓存档永远 miss，标题退化成会话 id。
 * 用 `try/catch` 兜不住：多传参数不抛错、只会被忽略，必须显式用 `fn.length` 分派。
 *
 * 本函数是插件里读 cachedSnapshot 的**唯一入口**（标题、子会话标签、投影行回填共用），
 * 保证三处同口径——只改一处会让另一处静默 miss。
 * @param ctx - 宿主上下文。
 * @param header - 会话 header（生命周期身份）。
 * @param keys - 需要的投影单元；省略表示取全部。
 * @returns 投影块；行缺失 / 服务不可用 / 形状异常均 undefined。
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
 * 折叠完整冷日志并写回官方投影缓存（`coldSnapshot(meta, inheritedEventCount, events)`）。
 *
 * 官方写回是 fail-soft、fire-and-forget 的（写失败只让下次冷读多折一段），本函数返回本次
 * 折叠结果供调用方立即使用（补发 added 时带上 cached 投影块）。这是官方公开的投影写回面：
 * 不直接写存储域、不复制官方折叠逻辑。
 * @param ctx - 宿主上下文。
 * @param header - 冷日志 header（须与 inheritedEventCount、events 同源）。
 * @param inheritedEventCount - fork 继承的事件前缀长度。
 * @param events - 完整有序事件日志。
 * @returns 投影块；服务不可用 / 官方签名不认识 / 折叠失败均 undefined（调用方降级）。
 */
export function coldSnapshotOf(
  ctx: Context,
  header: SessionHeader,
  inheritedEventCount: unknown,
  events: readonly unknown[],
): ProjectionBlock | undefined {
  const cache = projectionCacheService(ctx)
  const fn = cache?.coldSnapshot
  // 官方当前是 3 参；形参不足说明这条宿主线的签名不认识——宁可放弃回填也不传错参数。
  if (typeof fn !== 'function' || fn.length < 3) return undefined
  try {
    return projectionBlockOf(fn.call(cache, header, inheritedEventCount, events))
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 投影缓存回填失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/**
 * 把完整投影块过滤成官方 **summary 键集**（与官方冷摘要 `projectionsFor` 同口径）：
 * 整行投影可能几十 KB（turnOutline / tokenUsage / contextBreakdown 等非摘要单元），
 * `api-session/added` 只该带摘要键。取不到 `summaryKeys`（老版本）时回退整块——正确性优先。
 * @param ctx - 宿主上下文。
 * @param block - 完整投影块。
 * @returns 过滤后的投影块；输入 undefined 原样返回。
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

/** 官方投影缓存是否提供可识别的写回面（coldSnapshot 当前 3 参）：没有就不必读日志回填。 */
export function canWriteProjectionCache(ctx: Context): boolean {
  const fn = projectionCacheService(ctx)?.coldSnapshot
  return typeof fn === 'function' && fn.length >= 3
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

/**
 * 启动清扫：投影缓存里既不在持久化清单、也不在回收站里的会话行删除，@ 列表与真实持久化保持一致。
 *
 * 回收站里的会话（根 + sidecar 记录的子会话）必须**排除在外**：它们确实不在持久化清单里，
 * 但仍是「可还原的会话」，投影行是还原后标题 / 子会话标签的唯一来源。此前一律按持久化清单
 * 清扫，导致回收站期间行被删、还原后输入框 @ 退化成裸会话 id、任务板 @ 退化成项目目录名
 * （2026-11-08 实测）。永久删除时由删除路由负责失效这些行（见 trash.ts）。
 * @param ctx - 宿主上下文。
 * @param headerFacts - header 事实缓存（持久化清单）。
 * @param preservedIds - 需要保留投影行的会话 id（回收站里的可还原会话）。
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
