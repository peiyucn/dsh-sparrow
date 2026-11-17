

import { ROUTES } from '../../constants.js'
import type {
  CreateTaskGroupRequest, CreateTaskRequest, DeskTask, DeskTaskGroup, TaskDeleteResponse,
  TaskGroupDeleteResponse, TaskGroupListResponse, TaskGroupMoveResponse, TaskGroupMutationResponse, TaskGroupPatchRequest,
  TaskListResponse, TaskMutationResponse, TaskPatchRequest,
} from '../../contract.js'
import { fetchJson, postJson } from '../http.js'


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
