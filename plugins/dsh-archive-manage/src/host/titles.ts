/**
 * 标题与子会话标签的读取链：live 投影 → 冷投影缓存行 → 有界日志折叠，取不到回退会话 id / 无标签。
 * 两条链的缓存读取都按官方 `cachedSnapshot` 的**形参个数**自适应（官方跨版本改过签名）。
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionSeq, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import {
  createBudgetSignal, createLruCache, labelFromSubagentIdentity, runBounded, type SubagentIdentityValue,
} from '../archive.js'
import {
  FOLDED_LABEL_CACHE_MAX_ENTRIES, LABEL_FOLD_TIMEOUT_MS, TITLE_FOLD_BUDGET_MS, TITLE_FOLD_CONCURRENCY,
} from '../constants.js'

/** 官方 `cachedSnapshot` 的最小结构（返回 { values } 行）。 */
type CachedSnapshotReader = (...args: unknown[]) => { values?: Record<string, unknown> } | undefined
type CachedSnapshotCache = { cachedSnapshot?: CachedSnapshotReader } | undefined

/**
 * 读官方投影缓存行（`cachedSnapshot(meta, keys?)`）。
 *
 * ⚠️ **签名跨版本变过，必须按形参个数自适应**（2026-09-27 真机事故）：
 * - `0.1.5-rc.3` / `0.1.6-alpha.2`：`(meta, inheritedEventCount, keys?)` —— 3 参；
 * - **`0.1.7-rc.1` 起：`(meta, keys?)`** —— 中间参数被删，变 2 参。
 *
 * 此前写死三参时，0.1.7+ 上 `keys` 实收数字 `0` ⇒ 取不到任何单元 ⇒ 这一档**永远 miss**，
 * 全部退到有界日志折叠（实测单个会话 1.7 MB ~ 37 MB 压缩日志，超 8s 预算）⇒ 标题退化成 id。
 * 用 `try/catch` 兜不住：多传参数**不会抛错**（只是被忽略），必须显式用 `fn.length` 分派。
 */
function readCachedSnapshotValues(cache: CachedSnapshotCache, header: SessionHeader, unit: string): Record<string, unknown> | undefined {
  if (cache === undefined || typeof cache.cachedSnapshot !== 'function') return undefined
  const fn = cache.cachedSnapshot
  const snapshot = fn.length >= 3
    ? fn.call(cache, header, 0, [unit])
    : fn.call(cache, header, [unit])
  return snapshot?.values
}

function titleFromObservation(result: SessionTitleObservationResult | undefined, fallback: string): string {
  if (result?.status !== 'fulfilled') return fallback
  return result.value.title?.title ?? fallback
}

/**
 * 标题投影缓存读取（官方 title 单元 stateSchema = string|null、latest-wins）：
 * live 会话走投影注册表快照；冷会话走 sessionProjectionCache 行（官方 @ 列表同款，
 * list.ts:335 口径）。行值防御性解析（直接字符串或 {title} 对象都接受），无/空返回 undefined。
 */
function cachedTitle(ctx: Context, header: SessionHeader, live: unknown): string | undefined {
  const read = (values: Record<string, unknown> | null | undefined): string | undefined => {
    const raw: unknown = values?.title
    if (typeof raw === 'string') return raw.trim() === '' ? undefined : raw
    const wrapped = (raw as { title?: unknown } | null | undefined)?.title
    if (typeof wrapped === 'string') return wrapped.trim() === '' ? undefined : wrapped
    return undefined
  }
  if (live !== undefined) {
    const registry = ctx.get('sessionProjections') as unknown as {
      snapshot?: (session: unknown, units: readonly string[]) => { values: Record<string, unknown> } | undefined
    } | undefined
    if (registry !== undefined && typeof registry.snapshot === 'function') {
      try {
        const hit = read(registry.snapshot(live, ['title'])?.values)
        if (hit !== undefined) return hit
      } catch (error) {
        ctx.logger.warn(`dsh-archive-manage: 标题投影快照失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }
  const cache = ctx.get('sessionProjectionCache') as unknown as CachedSnapshotCache
  if (cache !== undefined && typeof cache.cachedSnapshot === 'function') {
    try {
      // 形参自适应见 readCachedSnapshotValues：写死三参会让这一档在 0.1.7+ 上 100% miss。
      const hit = read(readCachedSnapshotValues(cache, header, 'title'))
      if (hit !== undefined) return hit
    } catch (error) {
      ctx.logger.warn(`dsh-archive-manage: 标题投影缓存读取失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return undefined
}

/**
 * 批量标题三档：live 投影 → 冷缓存 → 折叠兜底。
 * 折叠共享一个整体预算信号（超时后未完成项按失败处理），最终取不到的 id 落 fallback（默认会话 id）。
 * 返回值包含全部输入 id 的键。
 *
 * 标题批量化（诊断结论 O(m·K) → O(K + m·L)）：全部 miss **整批一次** readTitleSnapshots——
 * 官方 projectMany 每次调用都要先跑一遍全量 listPersisted（corpus.ts:161），逐 id 单条调用是 O(m·K)
 * （m 个 miss = m 次全盘扫描 + m 次全日志折叠，只被 runBounded 的并发压成 ceil(m/4) 轮）；
 * 整批一次即 O(K + m·L)，且官方 projectMany 内部本就是 4 路并发读
 * （config.ts:9，与本插件 TITLE_FOLD_CONCURRENCY 同值）。返回**每个唯一 id 一条**、按首次出现顺序
 * 落定（官方 corpus.ts:137/249），故此处先按 id 去重再回填——输入重复 id 也不会错位。
 * 单条失败只影响该条（取不到 → fallback）；整批抛错（预算已超时等）同样退化为全部 fallback。
 */
export async function titlesFor(
  ctx: Context,
  headers: readonly SessionHeader[],
  fallback: (header: SessionHeader) => string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const misses: SessionHeader[] = []
  for (const header of headers) {
    const hit = cachedTitle(ctx, header, ctx.sessions.get(SessionId(String(header.id))))
    if (hit !== undefined) {
      out.set(String(header.id), hit)
      continue
    }
    misses.push(header)
  }
  if (misses.length === 0) return out
  // 预算信号自建：批结束（成功或失败）即 release，定时器不滞留到死线。
  const budget = createBudgetSignal(TITLE_FOLD_BUDGET_MS)
  try {
    const missingIds = [...new Set(misses.map(header => String(header.id)))]
    const observations = await ctx.sessionQuery.readTitleSnapshots(missingIds.map(id => SessionId(id)), budget.signal)
    const folded = new Map(missingIds.map((id, index) => [id, observations[index]]))
    for (const header of misses) {
      out.set(String(header.id), titleFromObservation(folded.get(String(header.id)), fallback(header)))
    }
    return out
  } catch (error) {
    // 整批失败（含预算超时）：标题退化为 fallback，列表照常返回，不让路由 500。
    ctx.logger.warn(`dsh-archive-manage: 标题折叠失败（${misses.length} 个会话）：${error instanceof Error ? error.message : String(error)}`)
    for (const header of misses) out.set(String(header.id), fallback(header))
    return out
  } finally {
    budget.release()
  }
}

/** 单会话标题（三档 + 兜底折叠；fallback 默认会话 id）。 */
export async function readTitle(ctx: Context, header: SessionHeader, fallback: string): Promise<string> {
  return titlesFor(ctx, [header], () => fallback).then(map => map.get(String(header.id)) ?? fallback)
}

/**
 * 日志折叠的 subagent 标签结论记忆：描述符事件一旦写入即不可变（官方注释 "a descriptor is
 * immutable once appended"），归档会话日志静止，按 sessionId 记忆安全。
 * 值 = 折叠出的标签；`null` = 权威判定「该会话没有标签」（同样值得记——否则每次打开面板
 * 都要为它重折一遍整份日志）。非权威结果（折叠失败、生命周期不匹配）不记。
 * LRU 上限淘汰最久未用条目（sessionId 为 UUID，删除后重建同 id 的可能性忽略不计）。
 */
const foldedSubagentLabels = createLruCache<string, string | null>(FOLDED_LABEL_CACHE_MAX_ENTRIES)

/** observeSession 观察结果（租约，用后必须 dispose）的最小结构。 */
interface FoldObservation {
  header?: { createdAt?: number }
  projections?: { values?: Record<string, SubagentIdentityValue | null | undefined> }
  dispose?: () => void
  /** rc.1 起官方观察租约是 Disposable 契约（[Symbol.dispose]），旧中间版是 dispose() 方法；两者都探测。 */
  [Symbol.dispose]?: () => void
}

/**
 * identity.seq → 官方 SessionSeq 品牌值；畸形值（缺失 / 负数 / 非安全整数 / -0）返回 undefined。
 * 官方 `SessionSeq()` 对非法输入抛 TypeError，本插件把它当「无法验证自有性」处理，不抛给调用方。
 */
function ownSeqOf(value: number | undefined): SessionSeq | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) return undefined
  return SessionSeq(value)
}

/**
 * 子会话标签：官方 subagent 投影单元 label（父会话给子会话的任务描述，不受父消息污染）。
 * 三档读链，与官方 list-children 同构——缓存只是捷径，日志才是权威，缓存坏掉只变慢、不变错：
 *   1. live 子会话 → 投影注册表快照（内存、同步；官方对 live 只走这一档，observeSession 会悬挂）；
 *   2. 冷会话 → 投影缓存行（展示级；行自带 identity + ver 校验，见下）；
 *   3. 冷 + 未种子 + 缓存行未给出权威结论 → observeSession 从日志重新折叠（官方同款权威兜底）。
 *      9-03 的 OOM 是「种子冷会话连带读父会话前缀」——isSeeded 门把该场景挡在档外，
 *      而不是禁用整条正路；观察是租约，用后 dispose，15s 超时防悬挂。
 * 均做能力检查 + 结构断言，失败返回 undefined，调用方回退标题单元结果。
 *
 * 第二档的判定从「取到 label 才算命中」改为「identity 非 null 即权威」——
 * one-shot 子会话的 label 官方定义为可选（projection-types.ts:30-33），此前这类会话
 * 每个都掉进第三档，把整份 zstd 日志解出来重折一遍（本机 10 个子会话 ≈ 8MB 压缩日志
 * ≈ 1s/次打开，且因折不出 label 永不进记忆 → 每次打开都重来）。
 */
export async function subagentLabel(ctx: Context, header: SessionHeader): Promise<string | undefined> {
  const sessionId = SessionId(String(header.id))
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    const registry = ctx.get('sessionProjections') as unknown as {
      snapshot?: (session: unknown, units: readonly string[]) => { values: Record<string, SubagentIdentityValue | null | undefined> }
    } | undefined
    if (registry !== undefined && typeof registry.snapshot === 'function') {
      try {
        const identity = registry.snapshot(live, ['subagent']).values.subagent
        if (identity === null || typeof identity !== 'object') return undefined
        // 自有后缀门（对齐官方 list-children.ts:224-225）：identity 必须折自
        // 子会话**自有**事件。fork 子会话在「自己的描述符写入前」的创建窗口里，快照带的是
        // seed 继承的祖先描述符——不挡就会把祖先标签显示成这个子会话的标签（官方此时不出行）。
        // seq 畸形 / 缺官方 isOwnSeq（不支持的 dsh）一律按「无法验证自有性」保守不出行。
        const seq = ownSeqOf(identity.seq)
        if (seq === undefined || typeof live.isOwnSeq !== 'function' || !live.isOwnSeq(seq)) return undefined
        return labelFromSubagentIdentity(identity) ?? undefined
      } catch (error) {
        ctx.logger.warn(`dsh-archive-manage: subagent 投影快照失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }
  const cache = ctx.get('sessionProjectionCache') as unknown as CachedSnapshotCache
  if (cache !== undefined && typeof cache.cachedSnapshot === 'function') {
    try {
      // 行的可靠性由官方保证：cachedSnapshot 先过 identityMatches（createdAt/cwd/isSeeded/
      // inheritedEventCount，session-projection-cache/src/index.ts:435，由 recordFor:136 调用）
      // 验「这份缓存属于这条生命周期」，viewCheckpoint 再丢弃 ver 与 live unit 不一致的行
      // （session-projection/src/index.ts:448）。所以拿到的 identity 是这份日志的有效折叠
      // 结果，可以直接当权威结论用。
      // ⚠️ 形参表跨版本变过，写死三参会静默毁掉这一档（详见 readCachedSnapshotValues）。
      const settled = labelFromSubagentIdentity(
        readCachedSnapshotValues(cache, header, 'subagent')?.subagent as SubagentIdentityValue | null | undefined,
      )
      if (settled !== undefined) return settled ?? undefined // 有标签返回标签；权威无标签直接结束（不再折叠）
    } catch (error) {
      ctx.logger.warn(`dsh-archive-manage: subagent 投影缓存读取失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!header.isSeeded) {
    const memoized = foldedSubagentLabels.get(String(sessionId))
    // null 亦为结论（该会话确实没有标签）：命中就不必再折一次整份日志。
    if (memoized !== undefined) return memoized ?? undefined
    const query = ctx.get('sessionQuery') as unknown as {
      observeSession?: (id: unknown, options: { signal?: AbortSignal }) => Promise<FoldObservation>
    } | undefined
    if (query !== undefined && typeof query.observeSession === 'function') {
      let observation: FoldObservation | undefined
      // 预算信号自建：成功与失败路径都 release，定时器不滞留到死线。
      const budget = createBudgetSignal(LABEL_FOLD_TIMEOUT_MS)
      try {
        observation = await query.observeSession(sessionId, { signal: budget.signal })
        // 生命周期见证：同 id 槽位被删后重建（createdAt 变化）不得串用旧观察。
        if (observation !== undefined
          && (observation.header?.createdAt === undefined || observation.header.createdAt === header.createdAt)) {
          const settled = labelFromSubagentIdentity(observation.projections?.values?.subagent)
          // 只记权威结论：折叠失败 / identity 缺失不记，下次仍可重试。
          if (settled !== undefined) {
            foldedSubagentLabels.set(String(sessionId), settled)
            return settled ?? undefined
          }
        }
      } catch (error) {
        ctx.logger.warn(`dsh-archive-manage: subagent 标签日志折叠失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      } finally {
        budget.release()
        try {
          // rc.1 租约走 [Symbol.dispose]，旧中间版走 dispose()；释放失败不影响回退。
          if (observation !== undefined) {
            if (typeof observation.dispose === 'function') observation.dispose()
            else observation[Symbol.dispose]?.()
          }
        } catch {
          // 租约释放 best-effort：失败不影响回退。
        }
      }
    }
  }
  return undefined
}

/** 批量子会话标签（有界并发折叠，与标题兜底同一并发上限；header.id → label，取不到的 id 不在映射中）。 */
export async function subagentLabels(ctx: Context, headers: readonly SessionHeader[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const results = await runBounded(headers, TITLE_FOLD_CONCURRENCY, header => subagentLabel(ctx, header))
  headers.forEach((header, index) => {
    const label = results[index]
    if (label !== undefined) out.set(String(header.id), label)
  })
  return out
}
