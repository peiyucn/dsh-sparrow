

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import { WorkspaceId, type Workspace, type WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  archiveAlignmentForChildren, type HeaderFactsStore,
} from './archive.js'
import type { ArchiveResponse, UnarchiveResponse } from '../../session-admin.js'
import type { RegistryMutationSurface } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { treeHeaderOf } from './headers.js'
import type {} from './events.js'
import { SessionsError } from './errors.js'
import { cachedSnapshotOf, readStrayBlankness, summaryBlockOf, type ProjectionBlock } from './projection.js'
import { PACKAGE_NAME } from './constants.js'


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


function isWorkspaceError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name
}


function archiveFailureOf(error: unknown): SessionsError {
  if (isWorkspaceError(error, 'WorkspaceActiveSessionError')) {
    const activity = (error as { activity?: readonly { kind?: unknown }[] }).activity ?? []
    const kinds = activity.map(entry => typeof entry.kind === 'string' ? entry.kind : 'activity').join('、')
    return new SessionsError(
      'SESSION_ACTIVE',
      `会话有进行中的活动${kinds === '' ? '' : `（${kinds}）`}，请先停止后再归档`,
      409,
    )
  }
  if (isWorkspaceError(error, 'WorkspaceUnknownSessionError')) {
    return new SessionsError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
  }
  if (error instanceof SessionsError) return error
  throw error
}


export async function archiveSession(ctx: Context, sessionId: SessionId): Promise<ArchiveResponse> {
  try {
    await ctx.workspaceRegistry.archiveSession(sessionId)
  } catch (error) {
    throw archiveFailureOf(error)
  }
  return { ok: true, archivedIds: ctx.workspaceRegistry.archivedSessionIds.map(String) }
}


export async function unarchiveSession(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
  sessionId: SessionId,
): Promise<UnarchiveResponse> {
  try {
    await ctx.workspaceRegistry.unarchiveSession(sessionId)
  } catch (error) {
    throw archiveFailureOf(error)
  }
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
    ctx.logger.warn(`${PACKAGE_NAME}: api-session/added 通知失败（${String(sessionId)}）：${error instanceof Error ? error.message : String(error)}`)
  }
  return { ok: true }
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


export async function readArchivedIds(ctx: Context): Promise<SessionId[]> {
  return [...ctx.workspaceRegistry.archivedSessionIds]
}


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


export async function removeArchivedIds(surface: RegistryMutationSurface, ids: readonly string[]): Promise<void> {
  const remove = new Set(ids)
  await mutateArchivedSet(surface, current => current.filter(id => !remove.has(String(id))))
}


export async function addArchivedId(surface: RegistryMutationSurface, sessionId: SessionId): Promise<void> {
  await mutateArchivedSet(surface, ids => ids.some(id => String(id) === String(sessionId)) ? ids : [...ids, sessionId])
}


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
    ctx.logger.info(`${PACKAGE_NAME}: 父子归档对齐 +${add.length} / -${remove.length}`)
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: 父子归档对齐失败：${error instanceof Error ? error.message : String(error)}`)
  }
}


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
    ctx.logger.warn(`${PACKAGE_NAME}: 启动清扫移除 ${current.length - cleaned.length} 个幽灵归档 id`)
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: 启动清扫失败：${error instanceof Error ? error.message : String(error)}`)
  }
}


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


export function emitSessionAdded(
  ctx: Context,
  header: SessionHeader,
  blank: boolean,
  projections?: ProjectionBlock,
): void {
  try {
    ctx.emit('api-session/added', {
      ...addedSummaryFor(header, blank),


      agentAvailable: ctx.agents.get(header.id) !== undefined,
      ...projections === undefined ? {} : {
        projections: { kind: 'cached' as const, asOfSeq: projections.asOfSeq, values: projections.values },
      },
    })
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: api-session/added 通知失败（${String(header.id)}）：${error instanceof Error ? error.message : String(error)}`)
  }
}
