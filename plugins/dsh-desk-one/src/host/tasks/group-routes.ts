/** Group REST routes: one-level task groups are first-class nodes (see store.moveGroup for lane moves). */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_QUERY_CHARS, ROUTES, TASK_STATUSES } from '../../constants.js'
import type {
  ArchiveTaskGroupRequest, CreateTaskGroupRequest, DeleteTaskGroupRequest, MoveTaskGroupRequest, TaskGroupDeleteResponse,
  TaskGroupListResponse, TaskGroupMoveResponse, TaskGroupMutationResponse, TaskGroupPatchRequest, UpdateTaskGroupRequest,
} from '../../contract.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'

async function listGroupsRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY_CHARS)
  const status = url.searchParams.get('status')
  if (status !== null && status !== '' && !(TASK_STATUSES as readonly string[]).includes(status)) {
    throw new DeskError('BAD_BODY', `未知的任务状态：${status}`)
  }
  const groups = route.store.listGroups(query)
    .filter(group => status === null || status === '' || group.status === status)
  sendJson(res, 200, { groups } satisfies TaskGroupListResponse)
}

async function createGroupRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<CreateTaskGroupRequest>(await readJsonBody(req), '请求体必须是对象')
  const group = await route.store.createGroup(body)
  sendJson(res, 201, { group } satisfies TaskGroupMutationResponse)
}

async function updateGroupRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<UpdateTaskGroupRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少分组 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  const rawPatch: unknown = body.patch
  if (typeof rawPatch !== 'object' || rawPatch === null || Array.isArray(rawPatch)) {
    throw new DeskError('BAD_BODY', '缺少 patch 对象')
  }
  const group = await route.store.updateGroup(body.id, body.expectedRevision, rawPatch as TaskGroupPatchRequest)
  sendJson(res, 200, { group } satisfies TaskGroupMutationResponse)
}

async function moveGroupRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<MoveTaskGroupRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少分组 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  if (typeof body.status !== 'string' || !(TASK_STATUSES as readonly string[]).includes(body.status)) {
    throw new DeskError('BAD_BODY', `未知的任务状态：${String(body.status)}`)
  }
  const result = await route.store.moveGroup(body.id, body.expectedRevision, body.status, body.order)
  sendJson(res, 200, { group: result.group, tasks: result.tasks } satisfies TaskGroupMoveResponse)
}

async function deleteGroupRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<DeleteTaskGroupRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少分组 id')
  await route.store.deleteGroup(body.id)
  sendJson(res, 200, { deleted: true } satisfies TaskGroupDeleteResponse)
}

async function archiveGroupRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<ArchiveTaskGroupRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少分组 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  if (typeof body.archived !== 'boolean') throw new DeskError('BAD_BODY', 'archived 必须是布尔值')
  const result = await route.store.archiveGroup(body.id, body.expectedRevision, body.archived)
  sendJson(res, 200, { group: result.group, tasks: result.tasks } satisfies TaskGroupMoveResponse)
}

export const GROUP_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.groups, handle: listGroupsRoute },
  { method: 'POST', path: ROUTES.groups, handle: createGroupRoute },
  { method: 'POST', path: ROUTES.groupUpdate, handle: updateGroupRoute },
  { method: 'POST', path: ROUTES.groupMove, handle: moveGroupRoute },
  { method: 'POST', path: ROUTES.groupArchive, handle: archiveGroupRoute },
  { method: 'POST', path: ROUTES.groupDelete, handle: deleteGroupRoute },
]
