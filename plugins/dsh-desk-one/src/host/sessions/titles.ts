/**
 * Read chain for titles and subagent labels: live projection → cold projection-cache row → bounded log fold,
 * falling back to the session id / no label when unavailable. Both chains adapt the cache read to the official
 * `cachedSnapshot`'s **parameter count** (the official signature changed across versions).
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionSeq, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-query'
import {
  createBudgetSignal, createLruCache, labelFromSubagentIdentity, runBounded, type SubagentIdentityValue,
} from './archive.js'
import {
  FOLDED_LABEL_CACHE_MAX_ENTRIES, LABEL_FOLD_TIMEOUT_MS, TITLE_FOLD_BUDGET_MS, TITLE_FOLD_CONCURRENCY,
} from './constants.js'
import { cachedSnapshotOf } from './projection.js'

function titleFromObservation(result: SessionTitleObservationResult | undefined, fallback: string): string {
  if (result?.status !== 'fulfilled') return fallback
  return result.value.title?.title ?? fallback
}

/**
 * Title projection-cache read (official title unit stateSchema = string|null, latest-wins):
 * live sessions go through the projection registry snapshot; cold sessions go through the
 * sessionProjectionCache row (same as the official @ list, list.ts:335). Row values are parsed
 * defensively (a bare string or a {title} object are both accepted); absent/empty returns undefined.
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
  return read(cachedSnapshotOf(ctx, header, ['title'])?.values)
}

/**
 * Batched titles, three tiers: live projection → cold cache → fold fallback.
 * The fold shares one overall budget signal (items unfinished at timeout count as failed), and ids still
 * unavailable at the end land on fallback (the session id by default). The result has a key for every input id.
 *
 * Title batching (diagnosis: O(m·K) → O(K + m·L)): all misses go through **one** readTitleSnapshots call —
 * the official projectMany runs a full listPersisted on every call (corpus.ts:161), so calling it per id is
 * O(m·K) (m misses = m full scans + m full log folds, squeezed only into ceil(m/4) rounds by runBounded's
 * concurrency); one batch is O(K + m·L), and the official projectMany already reads 4-way concurrently
 * internally (config.ts:9, the same value as this plugin's TITLE_FOLD_CONCURRENCY). It returns **one entry per
 * unique id**, settled in first-seen order (official corpus.ts:137/249), so we dedupe by id before filling
 * back — duplicate input ids cannot misalign. A single failure affects only that item (unavailable → fallback);
 * a whole-batch throw (budget already expired, etc.) degrades to all fallbacks as well.
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
  // Budget signal is self-built: released as soon as the batch ends (success or failure), so the timer doesn't linger until the deadline.
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
    // Whole-batch failure (including budget timeout): titles degrade to fallback and the list still returns, so the route never 500s.
    ctx.logger.warn(`dsh-archive-manage: 标题折叠失败（${misses.length} 个会话）：${error instanceof Error ? error.message : String(error)}`)
    for (const header of misses) out.set(String(header.id), fallback(header))
    return out
  } finally {
    budget.release()
  }
}

/** Title of a single session (three tiers + fallback fold; fallback defaults to the session id). */
export async function readTitle(ctx: Context, header: SessionHeader, fallback: string): Promise<string> {
  return titlesFor(ctx, [header], () => fallback).then(map => map.get(String(header.id)) ?? fallback)
}

/**
 * Memory of log-fold subagent label conclusions: a descriptor event is immutable once written (official note
 * "a descriptor is immutable once appended") and an archived session's log is static, so memoizing by
 * sessionId is safe. Value = the folded label; `null` = authoritatively "this session has no label" (worth
 * remembering too — otherwise the whole log would be re-folded every time the panel opens). Non-authoritative
 * results (fold failure, lifecycle mismatch) are not recorded. The LRU cap evicts the least recently used
 * entries (sessionIds are UUIDs, so the chance of the same id being recreated after deletion is negligible).
 */
const foldedSubagentLabels = createLruCache<string, string | null>(FOLDED_LABEL_CACHE_MAX_ENTRIES)

/** Minimal shape of an observeSession observation result (a lease; must be disposed after use). */
interface FoldObservation {
  header?: { createdAt?: number }
  projections?: { values?: Record<string, SubagentIdentityValue | null | undefined> }
  dispose?: () => void
  /** Since rc.1 the official observation lease is a Disposable contract ([Symbol.dispose]); older intermediate builds expose a dispose() method; both are probed. */
  [Symbol.dispose]?: () => void
}

/**
 * identity.seq → official SessionSeq branded value; malformed values (missing / negative / non-safe integer /
 * -0) return undefined. The official `SessionSeq()` throws a TypeError on invalid input; this plugin treats
 * that as "ownership cannot be verified" and does not throw to its callers.
 */
function ownSeqOf(value: number | undefined): SessionSeq | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) return undefined
  return SessionSeq(value)
}

/**
 * Subagent label: the official subagent projection unit's label (the task description the parent gave the
 * child, unpolluted by parent messages). A three-tier read chain, isomorphic to the official list-children —
 * the cache is only a shortcut, the log is authoritative, and a broken cache only makes things slower, not wrong:
 *   1. live child session → projection registry snapshot (in-memory, synchronous; the official code only uses
 *      this tier for live sessions, observeSession would hang);
 *   2. cold session → projection cache row (display-grade; the row carries its own identity + ver checks, see below);
 *   3. cold + unseeded + cache row gave no authoritative conclusion → observeSession re-folds from the log
 *      (the same authoritative fallback the official code uses). The 9-03 OOM was "a seeded cold session
 *      reading its parent's prefix along with it" — the isSeeded gate keeps that case out of this tier rather
 *      than disabling the whole legitimate path; observations are leases, disposed after use, with a 15s
 *      timeout against hangs.
 * All of them do capability checks + structural assertions and return undefined on failure, so the caller
 * falls back to the title unit's result.
 *
 * Tier 2's criterion changed from "a label was obtained, so it's a hit" to "identity is non-null, so it's
 * authoritative" — the label of a one-shot child session is officially optional (projection-types.ts:30-33),
 * and previously every such session fell into tier 3, decompressing the whole zstd log to re-fold it (10 child
 * sessions on this machine ≈ 8MB compressed log ≈ 1s per panel open, and since no label could be folded they
 * never entered the memo → starting over on every open).
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
        // Own-suffix gate (aligned with official list-children.ts:224-225): the identity must be folded from
        // the child session's **own** events. During the creation window before a forked child session writes
        // its own descriptor, the snapshot carries the ancestor descriptor inherited from the seed — without
        // this gate the ancestor's label would be shown as this child's label (the official code emits no row
        // at that point). A malformed seq / a missing official isOwnSeq (unsupported dsh) is conservatively
        // treated as "ownership cannot be verified", emitting no row.
        const seq = ownSeqOf(identity.seq)
        if (seq === undefined || typeof live.isOwnSeq !== 'function' || !live.isOwnSeq(seq)) return undefined
        return labelFromSubagentIdentity(identity) ?? undefined
      } catch (error) {
        ctx.logger.warn(`dsh-archive-manage: subagent 投影快照失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }
  // Row reliability is guaranteed by the official code: cachedSnapshot first runs identityMatches
  // (createdAt/cwd/isSeeded/inheritedEventCount, session-projection-cache/src/index.ts:435, called by
  // recordFor:136) to verify "this cache belongs to this lifecycle", then viewCheckpoint drops rows whose
  // ver doesn't match the live unit (session-projection/src/index.ts:448). So the identity we get is a valid
  // fold result for this log and can be used directly as an authoritative conclusion.
  // ⚠️ The parameter list changed across versions, so reads always go through cachedSnapshotOf in
  // projection.ts (dispatching on fn.length); hardcoding three parameters would silently kill this tier.
  const settled = labelFromSubagentIdentity(
    cachedSnapshotOf(ctx, header, ['subagent'])?.values.subagent as SubagentIdentityValue | null | undefined,
  )
  if (settled !== undefined) return settled ?? undefined // label present returns the label; authoritatively no label ends here (no fold)
  if (!header.isSeeded) {
    const memoized = foldedSubagentLabels.get(String(sessionId))
    // null is also a conclusion (the session really has no label): on a hit there's no need to fold the whole log again.
    if (memoized !== undefined) return memoized ?? undefined
    const query = ctx.get('sessionQuery') as unknown as {
      observeSession?: (id: unknown, options: { signal?: AbortSignal }) => Promise<FoldObservation>
    } | undefined
    if (query !== undefined && typeof query.observeSession === 'function') {
      let observation: FoldObservation | undefined
      // Budget signal is self-built: released on both success and failure paths, so the timer doesn't linger until the deadline.
      const budget = createBudgetSignal(LABEL_FOLD_TIMEOUT_MS)
      try {
        observation = await query.observeSession(sessionId, { signal: budget.signal })
        // Lifecycle witness: a slot recreated under the same id after deletion (createdAt changed) must not reuse the old observation.
        if (observation !== undefined
          && (observation.header?.createdAt === undefined || observation.header.createdAt === header.createdAt)) {
          const settled = labelFromSubagentIdentity(observation.projections?.values?.subagent)
          // Only record authoritative conclusions: fold failures / missing identity are not recorded, so the next attempt can still retry.
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
          // The rc.1 lease uses [Symbol.dispose], older intermediate builds use dispose(); a failed release does not affect the fallback.
          if (observation !== undefined) {
            if (typeof observation.dispose === 'function') observation.dispose()
            else observation[Symbol.dispose]?.()
          }
        } catch {
          // Lease release is best-effort: a failure does not affect the fallback.
        }
      }
    }
  }
  return undefined
}

/** Batched subagent labels (bounded-concurrency folds, same concurrency cap as the title fallback; header.id → label, ids that can't be resolved are absent from the map). */
export async function subagentLabels(ctx: Context, headers: readonly SessionHeader[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const results = await runBounded(headers, TITLE_FOLD_CONCURRENCY, header => subagentLabel(ctx, header))
  headers.forEach((header, index) => {
    const label = results[index]
    if (label !== undefined) out.set(String(header.id), label)
  })
  return out
}
