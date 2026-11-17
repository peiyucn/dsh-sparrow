

import type { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionSeq, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import {
  createBudgetSignal, createLruCache, labelFromSubagentIdentity, runBounded, type SubagentIdentityValue,
} from './archive.js'
import {
  FOLDED_LABEL_CACHE_MAX_ENTRIES, LABEL_FOLD_TIMEOUT_MS, PACKAGE_NAME, TITLE_FOLD_BUDGET_MS, TITLE_FOLD_CONCURRENCY,
} from './constants.js'
import { cachedSnapshotOf } from './projection.js'

function titleFromObservation(result: SessionTitleObservationResult | undefined, fallback: string): string {
  if (result?.status !== 'fulfilled') return fallback
  return result.value.title?.title ?? fallback
}


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
        ctx.logger.warn(`${PACKAGE_NAME}: 标题投影快照失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }
  return read(cachedSnapshotOf(ctx, header, ['title'])?.values)
}


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

    ctx.logger.warn(`${PACKAGE_NAME}: 标题折叠失败（${misses.length} 个会话）：${error instanceof Error ? error.message : String(error)}`)
    for (const header of misses) out.set(String(header.id), fallback(header))
    return out
  } finally {
    budget.release()
  }
}


export async function readTitle(ctx: Context, header: SessionHeader, fallback: string): Promise<string> {
  return titlesFor(ctx, [header], () => fallback).then(map => map.get(String(header.id)) ?? fallback)
}


const foldedSubagentLabels = createLruCache<string, string | null>(FOLDED_LABEL_CACHE_MAX_ENTRIES)


interface FoldObservation {
  header?: { createdAt?: number }
  projections?: { values?: Record<string, SubagentIdentityValue | null | undefined> }
  dispose?: () => void

  [Symbol.dispose]?: () => void
}


function ownSeqOf(value: number | undefined): SessionSeq | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) return undefined
  return SessionSeq(value)
}


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






        const seq = ownSeqOf(identity.seq)
        if (seq === undefined || typeof live.isOwnSeq !== 'function' || !live.isOwnSeq(seq)) return undefined
        return labelFromSubagentIdentity(identity) ?? undefined
      } catch (error) {
        ctx.logger.warn(`${PACKAGE_NAME}: subagent 投影快照失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }







  const settled = labelFromSubagentIdentity(
    cachedSnapshotOf(ctx, header, ['subagent'])?.values.subagent as SubagentIdentityValue | null | undefined,
  )
  if (settled !== undefined) return settled ?? undefined
  if (!header.isSeeded) {
    const memoized = foldedSubagentLabels.get(String(sessionId))

    if (memoized !== undefined) return memoized ?? undefined
    const query = ctx.get('sessionQuery') as unknown as {
      observeSession?: (id: unknown, options: { signal?: AbortSignal }) => Promise<FoldObservation>
    } | undefined
    if (query !== undefined && typeof query.observeSession === 'function') {
      let observation: FoldObservation | undefined

      const budget = createBudgetSignal(LABEL_FOLD_TIMEOUT_MS)
      try {
        observation = await query.observeSession(sessionId, { signal: budget.signal })

        if (observation !== undefined
          && (observation.header?.createdAt === undefined || observation.header.createdAt === header.createdAt)) {
          const settled = labelFromSubagentIdentity(observation.projections?.values?.subagent)

          if (settled !== undefined) {
            foldedSubagentLabels.set(String(sessionId), settled)
            return settled ?? undefined
          }
        }
      } catch (error) {
        ctx.logger.warn(`${PACKAGE_NAME}: subagent 标签日志折叠失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      } finally {
        budget.release()
        try {

          if (observation !== undefined) {
            if (typeof observation.dispose === 'function') observation.dispose()
            else observation[Symbol.dispose]?.()
          }
        } catch {

        }
      }
    }
  }
  return undefined
}


export async function subagentLabels(ctx: Context, headers: readonly SessionHeader[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const results = await runBounded(headers, TITLE_FOLD_CONCURRENCY, header => subagentLabel(ctx, header))
  headers.forEach((header, index) => {
    const label = results[index]
    if (label !== undefined) out.set(String(header.id), label)
  })
  return out
}
