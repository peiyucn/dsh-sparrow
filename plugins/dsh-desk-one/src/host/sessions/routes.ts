/**
 * Request validation and dispatch for the 12 REST routes: trust fence → table-driven match → request-level validation → domain module execution → unified error funnel.
 * Business logic lives in the host/ domain modules; this file only cares about HTTP shape and the request / response DTOs in contract.ts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  isDeleteConfirmationSufficient, straySessionIds, type ArchiveConfig, type HeaderFactsStore,
} from './archive.js'
import { PROJECTION_SEED_BACKGROUND_BUDGET_MS, ROUTES } from './constants.js'
import type {
  ArchiveRequest, ArchiveResponse, DeleteMutationResponse, DeleteRequest, ListResponse, RestoreRequest, RestoreResponse,
  StraysResponse, TrashDeleteAllRequest, TrashDeleteAllResponse, TrashDeleteRequest, TrashDeleteResponse,
  TrashDirResponse, TrashListResponse, TrashMutationResponse, TrashRequest, TrashRestoreAllRequest, TrashRestoreAllResponse,
  UnarchiveRequest, UnarchiveResponse,
} from '../../session-admin.js'
import type { DeskRouteContext } from '../router.js'
import { bodyObject, readJsonBody, sendJson } from '../http.js'
import { SessionsError } from './errors.js'
import {
  alignChildArchives, archiveSessionSubtree, readArchivedIds, unarchiveSession, workspaceIndexFor,
} from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import { assertSessionLocationApi } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { readStrayBlankness } from './projection.js'
import { finalizeRestoredSessions } from './projection-seed.js'
import {
  assertHeaderFormatSupported, deleteSessionTree, ensureSessionNotLive, listSubagentTargets, moveSessionToTrash,
  sessionDirectoryFor,
} from './session-files.js'
import type { StartupScans } from './startup.js'
import {
  deleteAllTrashItems, deleteTrashEntry, listTrashPayload, resolveTrashDir, restoreAllTrashItems, restoreTrashDir,
  trashDirPayload,
} from './trash.js'
import { readTitle } from './titles.js'
import { archiveTreePayload, strayItemsPayload } from './views.js'

/** Host wiring available to a single request. */
interface ArchiveRouteContext {
  readonly ctx: Context
  readonly settings: ArchiveConfig
  readonly surface: RegistryMutationSurface
  readonly headerFacts: HeaderFactsStore<HeaderFacts>
  readonly startup: StartupScans
}

type RouteHandler = (route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse) => Promise<void>

/** One row of the desk-one route table (structurally identical to `DeskRouteEntry`). */
export interface SessionRouteEntry {
  readonly method: string
  readonly path: string
  readonly handle: (route: DeskRouteContext, req: IncomingMessage, res: ServerResponse) => Promise<void>
}

/**
 * Mount the session routes into desk-one's router. The trust fence, 404 handling and error mapping
 * stay in `host/router.ts` + `host/http.ts`; these handlers only own request shapes and domain calls.
 */
export function createSessionRoutes(deps: ArchiveRouteContext): readonly SessionRouteEntry[] {
  return ROUTE_TABLE.map(entry => ({
    method: entry.method,
    path: entry.path,
    handle: (_route, req, res) => entry.handle(deps, req, res),
  }))
}

/** id field in the request body: a non-empty string, otherwise 400. The original value is kept (each route decides whether to trim). */
function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new SessionsError('BAD_BODY', message)
  return value
}

async function listRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  // /list is the "user opened the panel" signal: run the three startup scans first, then lazily align parent/child state so the first screen shows the cleaned-up result.
  route.startup.run()
  await alignChildArchives(route.ctx, route.surface, route.headerFacts)
  const body = await archiveTreePayload(route.ctx, route.headerFacts)
  sendJson(res, 200, body satisfies ListResponse)
}

async function straysRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await strayItemsPayload(route.ctx, route.headerFacts)
  sendJson(res, 200, body satisfies StraysResponse)
}

async function trashListRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await listTrashPayload(route.settings.trashRoot)
  sendJson(res, 200, body satisfies TrashListResponse)
}

async function trashDirRoute(route: ArchiveRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, trashDirPayload(route.settings.trashRoot) satisfies TrashDirResponse)
}

async function unarchiveRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Unarchive: only touches the archived set, never files — live sessions (held by dsh) can be unarchived too; idempotent.
  const parsed = bodyObject<UnarchiveRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const sessionId = SessionId(requireNonEmptyString(parsed.sessionId, 'sessionId 必须是非空字符串'))
  const body = await unarchiveSession(route.ctx, route.surface, route.headerFacts, sessionId)
  sendJson(res, 200, body satisfies UnarchiveResponse)
}

async function archiveRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Archiving is parent-scoped — the parent plus every child session enters the archived set (atomic in a single write chain).
  // Only serves stray/orphan child sessions (the official menu cannot reach them); children of officially archived parents are aligned by domain/changed.
  const parsed = bodyObject<ArchiveRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const rootId = requireNonEmptyString(parsed.sessionId, 'sessionId 必须是非空字符串').trim()
  const body = await archiveSessionSubtree(route.surface, route.headerFacts, rootId)
  sendJson(res, 200, body satisfies ArchiveResponse)
}

async function sessionTrashOrDeleteRoute(
  route: ArchiveRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  isDelete: boolean,
): Promise<void> {
  const { ctx, surface, headerFacts } = route
  const parsed = bodyObject<TrashRequest & DeleteRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const sessionId = SessionId(requireNonEmptyString(parsed.sessionId, 'sessionId 必须是非空字符串'))
  const archivedIds = await readArchivedIds(ctx)
  const headers = (await headerFacts.get()).headers
  const attachedIds = ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds.map(id => String(id)))
  const strayIds = straySessionIds(headers.map(header => String(header.id)), archivedIds.map(id => String(id)), attachedIds)
  const isArchived = archivedIds.some(id => String(id) === String(sessionId))
  const isStray = strayIds.includes(String(sessionId))
  if (!isArchived && !isStray) {
    throw new SessionsError('NOT_ARCHIVED', '只有已归档或游离会话才能移入回收站或删除')
  }
  const live = ctx.sessions.get(sessionId)
  const header = live?.header ?? headers.find(candidate => String(candidate.id) === String(sessionId))
  if (header === undefined) {
    throw new SessionsError('UNKNOWN_SESSION', '会话持久化中没有这个会话', 404)
  }
  // Host-truth format gate (request time, before any file operation).
  assertHeaderFormatSupported(header)
  const title = await readTitle(ctx, header, header.id)
  const strayBlank = isStray && readStrayBlankness(ctx, String(sessionId))
  if (isDelete) {
    if (strayBlank) {
      if (parsed.confirm !== true) {
        throw new SessionsError('CONFIRMATION_FAILED', '删除空白游离会话需要确认')
      }
    } else if (!isDeleteConfirmationSufficient(title, parsed.confirmTitle)) {
      throw new SessionsError('CONFIRMATION_FAILED', '删除确认失败：请输入完整会话标题')
    }
  } else if (parsed.confirm !== true) {
    throw new SessionsError('CONFIRMATION_FAILED', '移入回收站需要二次确认')
  }

  const workspaces = workspaceIndexFor(ctx.workspaceRegistry.list()).get(String(sessionId)) ?? []
  ensureSessionNotLive(ctx, sessionId)
  const location = assertSessionLocationApi(ctx.sessionPersistence).locate(header)
  const sessionDir = location === undefined ? undefined : sessionDirectoryFor(location)
  if (sessionDir === undefined) {
    throw new SessionsError('BACKEND_UNSUPPORTED', '当前会话持久化后端不提供已知的单会话目录，无法移入回收站/删除', 501)
  }

  const subagents = await listSubagentTargets(ctx, sessionId, headerFacts)
  if (isDelete) {
    const body = await deleteSessionTree(ctx, surface, { sessionId, sessionDir, subagents, workspaceIds: workspaces })
    sendJson(res, 200, body satisfies DeleteMutationResponse)
    return
  }
  const body = await moveSessionToTrash(ctx, surface, route.settings.trashRoot, {
    sessionId, sessionDir, title, subagents, workspaceIds: workspaces,
  })
  sendJson(res, 200, body satisfies TrashMutationResponse)
}

async function trashDeleteRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<TrashDeleteRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const trashId = requireNonEmptyString(parsed.trashId, 'trashId 必须是非空字符串')
  if (parsed.confirm !== true) {
    throw new SessionsError('CONFIRMATION_FAILED', '彻底删除回收站条目需要二次确认')
  }
  const body = await deleteTrashEntry(route.ctx, route.settings.trashRoot, trashId)
  sendJson(res, 200, body satisfies TrashDeleteResponse)
}

async function restoreRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<RestoreRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  const trashId = requireNonEmptyString(parsed.trashId, 'trashId 必须是非空字符串')
  const trashDir = resolveTrashDir(route.settings.trashRoot, trashId)
  const sidecar = await restoreTrashDir(route.ctx, route.surface, trashDir)
  // Restore moves session directories back into persistence: invalidate the header cache immediately so later reads can see them.
  route.headerFacts.invalidate()
  // Projection rows may have been removed by an older startup sweep while in the trash: read the cold logs back and rebuild
  // through the official coldSnapshot, then emit added with cached projection blocks — so both the input-box @ and task-board @
  // can show titles / sub-session labels.
  await finalizeRestoredSessions(route.ctx, [
    sidecar.sessionId,
    ...(sidecar.subagents ?? []).map(child => child.sessionId),
  ])
  sendJson(res, 200, { ok: true, sessionId: sidecar.sessionId, workspaceIds: sidecar.workspaceIds } satisfies RestoreResponse)
}

async function restoreAllRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<TrashRestoreAllRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  if (parsed.confirm !== true) {
    throw new SessionsError('CONFIRMATION_FAILED', '还原全部回收站条目需要二次确认')
  }
  const { body, restoredTreeIds } = await restoreAllTrashItems(route.ctx, route.surface, route.settings.trashRoot)
  route.headerFacts.invalidate()
  sendJson(res, 200, body satisfies TrashRestoreAllResponse)
  // "Restore all" may restore dozens of entries at once (measured: 43 entries / 139 MB): projection backfill runs in the background after the response,
  // without blocking the operation; unfinished parts are completed by the next startup repair (see projection-seed.ts).
  if (restoredTreeIds.length > 0) {
    void finalizeRestoredSessions(route.ctx, restoredTreeIds, PROJECTION_SEED_BACKGROUND_BUDGET_MS).catch((error: unknown) => {
      route.ctx.logger.warn(`dsh-archive-manage: 全部还原后的投影行回填失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }
}

async function deleteAllRoute(route: ArchiveRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = bodyObject<TrashDeleteAllRequest>(await readJsonBody(req), '请求体必须是 JSON 对象')
  if (parsed.confirm !== true) {
    throw new SessionsError('CONFIRMATION_FAILED', '彻底删除全部回收站条目需要二次确认')
  }
  const body = await deleteAllTrashItems(route.ctx, route.settings.trashRoot)
  sendJson(res, 200, body satisfies TrashDeleteAllResponse)
}

/** Route table: method + exact path → handler (`/trash` serves both GET list and POST move-to-trash). */
const ROUTE_TABLE: readonly { readonly method: string; readonly path: string; readonly handle: RouteHandler }[] = [
  { method: 'GET', path: ROUTES.list, handle: listRoute },
  { method: 'GET', path: ROUTES.strays, handle: straysRoute },
  { method: 'GET', path: ROUTES.trash, handle: trashListRoute },
  { method: 'GET', path: ROUTES.trashDir, handle: trashDirRoute },
  { method: 'POST', path: ROUTES.unarchive, handle: unarchiveRoute },
  { method: 'POST', path: ROUTES.archive, handle: archiveRoute },
  { method: 'POST', path: ROUTES.trash, handle: (route, req, res) => sessionTrashOrDeleteRoute(route, req, res, false) },
  { method: 'POST', path: ROUTES.delete, handle: (route, req, res) => sessionTrashOrDeleteRoute(route, req, res, true) },
  { method: 'POST', path: ROUTES.trashDelete, handle: trashDeleteRoute },
  { method: 'POST', path: ROUTES.restore, handle: restoreRoute },
  { method: 'POST', path: ROUTES.trashRestoreAll, handle: restoreAllRoute },
  { method: 'POST', path: ROUTES.trashDeleteAll, handle: deleteAllRoute },
]

