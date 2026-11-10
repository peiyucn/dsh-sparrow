/**
 * Archived set / workspace accounting: reads and writes go through the official write serialization chain;
 * parent-child alignment, ghost sweeping, and unarchive notifications live here.
 * The archived set is public state of the official WorkspaceRegistry; writes only go through
 * enqueueOperation + requireState + setState.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import { WorkspaceId, type Workspace, type WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  archiveAlignmentForChildren, collectSubtreeIds, type HeaderFactsStore,
} from './archive.js'
import type { ArchiveResponse, UnarchiveResponse } from '../../session-admin.js'
import type { RegistryMutationSurface } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { treeHeaderOf } from './headers.js'
import type {} from './events.js'
import { SessionsError } from './errors.js'
import { cachedSnapshotOf, readStrayBlankness, summaryBlockOf, type ProjectionBlock } from './projection.js'

/**
 * Prebuild a "session id → ids of workspaces holding it" index (performance audit: no O(n²) on the hot path).
 * The old implementation scanned all "workspaces × sessions" for every node while assembling /list; now the
 * index is built once and reused for the whole tree.
 * Output order = workspace list order; duplicate sessionId entries in one workspace are recorded once
 * (matching the old includes semantics).
 */
export function workspaceIndexFor(workspaces: readonly Workspace[]): Map<string, readonly string[]> {
  const index = new Map<string, string[]>()
  for (const workspace of workspaces) {
    const workspaceId = String(workspace.id)
    for (const sessionId of workspace.sessionIds) {
      const key = String(sessionId)
      const holders = index.get(key)
      if (holders === undefined) index.set(key, [workspaceId])
      else if (!holders.includes(workspaceId)) holders.push(workspaceId)
    }
  }
  return index
}

export async function detachWorkspaceAccounting(ctx: Context, sessionId: SessionId): Promise<void> {
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (workspace.sessionIds.includes(sessionId)) {
      await workspace.detachSession(sessionId)
    }
  }
}

export async function attachWorkspaceAccounting(ctx: Context, sessionId: SessionId, workspaceIds: readonly string[]): Promise<void> {
  for (const id of workspaceIds) {
    const workspace = ctx.workspaceRegistry.get(WorkspaceId(id))
    if (workspace !== undefined) await workspace.attachSession(sessionId)
  }
}

/** Read the archived set via the official public getter (after the channel migration, in-memory state and the
 *  domain stay in sync, so reading the domain directly is no longer needed). */
export async function readArchivedIds(ctx: Context): Promise<SessionId[]> {
  return [...ctx.workspaceRegistry.archivedSessionIds]
}

/**
 * Read-modify-write of the archived set: run on the official enqueueOperation serialization chain; inside the
 * chain, requireState → compute the new set → setState (official persistence write: domain + in-memory state
 * sync in one step). If update returns the same reference, or the contents are item-by-item identical, treat it
 * as no change (removeArchivedId's filter always returns a new array, so content comparison is what makes
 * "not in the set" truly zero writes and zero event noise).
 */
export function mutateArchivedSet(surface: RegistryMutationSurface, update: (ids: readonly SessionId[]) => readonly SessionId[]): Promise<void> {
  return surface.enqueueOperation(async () => {
    const state: WorkspaceDomainState = surface.requireState()
    const next = update(state.archivedSessionIds)
    if (next === state.archivedSessionIds) return
    const unchanged = next.length === state.archivedSessionIds.length
      && next.every((id, index) => String(id) === String(state.archivedSessionIds[index]))
    if (unchanged) return
    await surface.setState({ ...state, archivedSessionIds: [...next] })
  })
}

/** Remove a session from the archived set (shared by unarchive / move to trash / permanent delete); no-op if absent. */
async function removeArchivedId(surface: RegistryMutationSurface, sessionId: SessionId): Promise<void> {
  await mutateArchivedSet(surface, ids => ids.filter(id => String(id) !== String(sessionId)))
}

/**
 * Archived-set cleanup after moving to the trash / permanent deletion: remove "the root plus **all descendants**
 * actually moved/deleted" in one write chain. Official persistence has a flat sibling layout
 * (sessionDir = projectDir/encodeSegment(id), and children inherit the parent's cwd), while trash/delete moves
 * or deletes the whole subtree directory by directory, so the entire subtree must leave the archived set —
 * removing only direct children would leave depth ≥2 descendants as permanent orphan roots (their parents are
 * gone from headers, parent-child alignment skips orphans, and there is no way to remove them).
 * The caller supplies ids to remove via archivedIdsToRemove(root, all descendant ids).
 */
export async function removeArchivedIds(surface: RegistryMutationSurface, ids: readonly string[]): Promise<void> {
  const remove = new Set(ids)
  await mutateArchivedSet(surface, current => current.filter(id => !remove.has(String(id))))
}

/** Add a session back to the archived set (restore from trash returns it to the hidden state); no-op if already present. */
export async function addArchivedId(surface: RegistryMutationSurface, sessionId: SessionId): Promise<void> {
  await mutateArchivedSet(surface, ids => ids.some(id => String(id) === String(sessionId)) ? ids : [...ids, sessionId])
}

/**
 * Parent-child archive alignment (state invariant: children mirror parents):
 * - "parent archived, child not archived" → add the child; "parent not archived, child archived" → remove the child.
 * - Triggers: startup + official workspace domain write event (domain/changed) + lazy fallback on panel open; idempotent.
 * - Headers come from the header facts cache (single-flight / TTL / write-through invalidation), so opening the
 *   panel no longer scans the disk for alignment (previously every /list called list() directly).
 */
export async function alignChildArchives(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<void> {
  try {
    const { headers } = await headerFacts.get()
    const archived = await readArchivedIds(ctx)
    const { add, remove } = archiveAlignmentForChildren(headers.map(treeHeaderOf), archived.map(String))
    if (add.length === 0 && remove.length === 0) return
    await mutateArchivedSet(surface, ids => {
      const next = new Set(ids.map(String))
      for (const id of add) next.add(id)
      for (const id of remove) next.delete(id)
      return [...next].map(id => SessionId(id))
    })
    ctx.logger.info(`dsh-archive-manage: 父子归档对齐 +${add.length} / -${remove.length}`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 父子归档对齐失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Startup sweep: remove ghost ids from the archived set that are not in persistence (legacy defense — ghost
 * entries may have been created during the old direct-write era; the channel migration no longer creates new
 * ghosts, so this remains a one-time defense).
 * Headers come from the header facts cache, sharing the same disk scan with other startup reads.
 */
export async function sweepGhostArchivedIds(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<void> {
  try {
    const { headers } = await headerFacts.get()
    const known = new Set(headers.map(header => String(header.id)))
    const current = await readArchivedIds(ctx)
    const cleaned = current.filter(id => known.has(String(id)))
    if (cleaned.length === current.length) return
    await mutateArchivedSet(surface, () => cleaned)
    ctx.logger.warn(`dsh-archive-manage: 启动清扫移除 ${current.length - cleaned.length} 个幽灵归档 id`)
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Build the official api-session/added payload (a structured subset of SessionSummary): only sessionId/updatedAt/
 * running/blank are required; other fields are exposed optionally based on the header. Non-resident sessions have
 * no active event time, so updatedAt uses header.createdAt (consistent with the /list view).
 */
export function addedSummaryFor(header: SessionHeader, blank: boolean): {
  sessionId: SessionId
  updatedAt: number
  running: boolean
  blank: boolean
  parentSessionId?: SessionId
  origin?: 'subagent'
  cwd?: string
} {
  return {
    sessionId: header.id,
    updatedAt: header.createdAt,
    running: false,
    blank,
    ...header.parentSession === undefined ? {} : { parentSessionId: header.parentSession },
    ...header.origin === 'subagent' ? { origin: 'subagent' as const } : {},
    ...header.cwd === undefined ? {} : { cwd: header.cwd },
  }
}

/**
 * Re-emit the official api-session/added event.
 *
 * Besides the session summary, it can carry an official **cached** projection block: the client's
 * `handleSessionAdded` applies it via `applyCached` (session-controller/src/client/sessions/manager.ts:677),
 * so the session list gets titles / subagent labels without a refresh — the key to keeping input-box @ and
 * task-board @ displays consistent after restore.
 * @param ctx - Host context.
 * @param header - Session header (source of truth for the added payload).
 * @param blank - Whether the session is blank.
 * @param projections - Optional official cached projection block; when omitted, only the entry is added and
 * titles wait for the next list refresh.
 */
export function emitSessionAdded(
  ctx: Context,
  header: SessionHeader,
  blank: boolean,
  projections?: ProjectionBlock,
): void {
  try {
    ctx.emit('api-session/added', {
      ...addedSummaryFor(header, blank),
      // Since rc.1, SessionSummary has a required `agentAvailable` (whether the session currently holds a live
      // Agent; see `api/session-controller/src/types.ts:177-188`): match official semantics and use the agents registry.
      agentAvailable: ctx.agents.get(header.id) !== undefined,
      ...projections === undefined ? {} : {
        projections: { kind: 'cached' as const, asOfSeq: projections.asOfSeq, values: projections.values },
      },
    })
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: api-session/added 通知失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Unarchive: touch only the archived set, never files (live sessions can be unarchived too); then re-emit the
 * "back in the list" notification.
 *
 * Why re-emit added: the client's `handleSessionAdded` merges the session into the list immediately, so the user
 * does not need to refresh; without it a refresh is required — and the refresh makes dsh load the session into
 * the live store, after which "archive again → move to trash" is blocked by the hold guard
 * (ensureSessionNotLive). Headers come from the header facts cache, sharing the single flight with /list /strays,
 * so this does not scan the disk separately; it also includes the cached projection block, so sessions with a
 * seeded projection row show their titles immediately after unarchive.
 */
export async function unarchiveSession(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
  sessionId: SessionId,
): Promise<UnarchiveResponse> {
  await removeArchivedId(surface, sessionId)
  try {
    const { headers } = await headerFacts.get()
    const header = headers.find(candidate => String(candidate.id) === String(sessionId))
    if (header !== undefined) {
      emitSessionAdded(
        ctx,
        header,
        readStrayBlankness(ctx, String(sessionId)),
        summaryBlockOf(ctx, cachedSnapshotOf(ctx, header)),
      )
    }
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: api-session/added 通知失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
  }
  return { ok: true }
}

/** Archiving is parent-scoped: the parent plus all its child sessions enter the archived set together (atomic
 *  single write chain). Only serves stray / orphan child sessions. */
export async function archiveSessionSubtree(
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
  rootId: string,
): Promise<ArchiveResponse> {
  const headers = (await headerFacts.get()).headers
  if (!headers.some(header => String(header.id) === rootId)) {
    throw new SessionsError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
  }
  const subtree = collectSubtreeIds(headers.map(treeHeaderOf), rootId)
  await mutateArchivedSet(surface, ids => {
    const next = new Set(ids.map(String))
    for (const id of subtree) next.add(id)
    return [...next].map(id => SessionId(id))
  })
  return { ok: true, archivedIds: subtree }
}
