/** Browser-side task/group data plane: host REST routes only. */

import { REQUEST_TIMEOUT_MS, ROUTES } from '../../constants.js'
import type {
  ApiErrorPayload, CreateTaskGroupRequest, CreateTaskRequest, DeskTask, DeskTaskGroup, TaskDeleteResponse,
  TaskGroupDeleteResponse, TaskGroupListResponse, TaskGroupMoveResponse, TaskGroupMutationResponse, TaskGroupPatchRequest,
  TaskListResponse, TaskMutationResponse, TaskPatchRequest,
} from '../../contract.js'

/** JSON request with a timeout; non-2xx surfaces the server message so failures stay visible. */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const text = await response.text()
  let payload: T & Partial<ApiErrorPayload>
  try {
    payload = JSON.parse(text) as T & Partial<ApiErrorPayload>
  } catch {
    throw new Error(`请求失败（HTTP ${response.status}）：${text.slice(0, 160) || '响应不是 JSON'}`)
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  return payload
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Load the whole board (archived tasks included; the view filters). */
export function listTasks(): Promise<readonly DeskTask[]> {
  return fetchJson<TaskListResponse>(`${ROUTES.tasks}?include_archived=1`).then(payload => payload.tasks)
}

export function createTask(input: CreateTaskRequest): Promise<DeskTask> {
  return postJson<TaskMutationResponse>(ROUTES.tasks, input).then(payload => payload.task)
}

export function updateTask(input: {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: TaskPatchRequest
}): Promise<DeskTask> {
  return postJson<TaskMutationResponse>(ROUTES.taskUpdate, input).then(payload => payload.task)
}

export function deleteTask(id: string): Promise<void> {
  return postJson<TaskDeleteResponse>(ROUTES.taskDelete, { id }).then(() => undefined)
}

export function listGroups(): Promise<readonly DeskTaskGroup[]> {
  return fetchJson<TaskGroupListResponse>(ROUTES.groups).then(payload => payload.groups)
}

export function createGroup(input: CreateTaskGroupRequest): Promise<DeskTaskGroup> {
  return postJson<TaskGroupMutationResponse>(ROUTES.groups, input).then(payload => payload.group)
}

export function updateGroup(input: {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: TaskGroupPatchRequest
}): Promise<DeskTaskGroup> {
  return postJson<TaskGroupMutationResponse>(ROUTES.groupUpdate, input).then(payload => payload.group)
}

export function moveGroup(input: {
  readonly id: string
  readonly expectedRevision: number
  readonly status: string
  readonly order?: number
}): Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }> {
  return postJson<TaskGroupMoveResponse>(ROUTES.groupMove, input).then(payload => ({
    group: payload.group,
    tasks: payload.tasks,
  }))
}

export function deleteGroup(id: string): Promise<void> {
  return postJson<TaskGroupDeleteResponse>(ROUTES.groupDelete, { id }).then(() => undefined)
}

/** Archive / restore a whole group (host archives its cards too). */
export function archiveGroup(input: {
  readonly id: string
  readonly expectedRevision: number
  readonly archived: boolean
}): Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }> {
  return postJson<TaskGroupMoveResponse>(ROUTES.groupArchive, input).then(payload => ({
    group: payload.group,
    tasks: payload.tasks,
  }))
}
