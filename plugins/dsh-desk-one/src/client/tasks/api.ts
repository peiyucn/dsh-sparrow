/** Browser-side task data plane: host REST routes only (the client never touches storage directly). */

import { REQUEST_TIMEOUT_MS, ROUTES } from '../../constants.js'
import type {
  ApiErrorPayload, CreateTaskRequest, DeskTask, TaskDeleteResponse, TaskListResponse, TaskMutationResponse,
  TaskPatchRequest,
} from '../../contract.js'

/** JSON request with a timeout; non-2xx surfaces the server message so failures stay visible. */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const payload = await response.json() as T & Partial<ApiErrorPayload>
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

/** Load the whole board (archived included; the view filters). Board size is bounded by its lanes. */
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
