/** Task REST routes: handlers only; mounting / trust fence live in host/router.ts. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_QUERY_CHARS, ROUTES, TASK_STATUSES } from '../../constants.js'
import type {
  CreateTaskRequest, DeleteTaskRequest, TaskDeleteResponse, TaskListResponse, TaskMutationResponse,
  UpdateTaskRequest,
} from '../../contract.js'
import type { TaskPatch } from '../../model.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'

async function listTasksRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY_CHARS)
  const status = url.searchParams.get('status')
  if (status !== null && status !== '' && !(TASK_STATUSES as readonly string[]).includes(status)) {
    throw new DeskError('BAD_BODY', `未知的任务状态：${status}`)
  }
  const includeArchived = url.searchParams.get('include_archived') === '1'
  const tasks = route.store.listTasks(query)
    .filter(task => (status === null || status === '' || task.status === status) && (includeArchived || !task.archived))
  sendJson(res, 200, { tasks } satisfies TaskListResponse)
}

async function createTaskRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<CreateTaskRequest>(await readJsonBody(req), '请求体必须是对象')
  const task = await route.store.createTask(body)
  sendJson(res, 201, { task } satisfies TaskMutationResponse)
}

async function updateTaskRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<UpdateTaskRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少任务 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  const rawPatch: unknown = body.patch
  if (typeof rawPatch !== 'object' || rawPatch === null || Array.isArray(rawPatch)) {
    throw new DeskError('BAD_BODY', '缺少 patch 对象')
  }
  const task = await route.store.updateTask(body.id, body.expectedRevision, rawPatch as TaskPatch)
  sendJson(res, 200, { task } satisfies TaskMutationResponse)
}

async function deleteTaskRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<DeleteTaskRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少任务 id')
  await route.store.deleteTask(body.id)
  sendJson(res, 200, { deleted: true } satisfies TaskDeleteResponse)
}

export const TASK_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.tasks, handle: listTasksRoute },
  { method: 'POST', path: ROUTES.tasks, handle: createTaskRoute },
  { method: 'POST', path: ROUTES.taskUpdate, handle: updateTaskRoute },
  { method: 'POST', path: ROUTES.taskDelete, handle: deleteTaskRoute },
]
