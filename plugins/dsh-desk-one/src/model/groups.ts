/**
 * Task groups: one-level containers inside a lane. Pure input normalization, record creation,
 * patching with optimistic concurrency, sorting and filtering.
 */

import { DESK_NODE_SCHEMA } from '../constants.js'
import type { DeskTaskGroup, TaskStatus } from '../contract.js'
import { DeskModelError } from './errors.js'
import { isTaskStatus, normalizeGroupName, normalizeOrder } from './fields.js'

export interface GroupInput {
  readonly name: string
  readonly status: TaskStatus
  readonly order: number
}

export interface GroupPatch {
  readonly name?: string
  readonly order?: number
  readonly archived?: boolean
}

/** Normalize a group creation request; groups always live in exactly one lane. */
export function normalizeGroupInput(raw: {
  readonly name?: unknown
  readonly status?: unknown
  readonly order?: unknown
}): GroupInput {
  const name = normalizeGroupName(raw.name)
  if (name === undefined) throw new DeskModelError('INVALID_GROUP', '分组需要名字')
  const status = raw.status === undefined || raw.status === '' ? 'todo' : raw.status
  if (!isTaskStatus(status)) throw new DeskModelError('INVALID_GROUP', `未知的泳道：${String(raw.status)}`)
  return { name, status, order: normalizeOrder(raw.order) ?? 0 }
}

/** Create a group record (pure: id / time come from the caller). */
export function createGroupRecord(
  input: GroupInput,
  meta: { readonly id: string; readonly now: string },
): DeskTaskGroup {
  return {
    id: meta.id,
    kind: 'group',
    schema: DESK_NODE_SCHEMA,
    name: input.name,
    status: input.status,
    order: input.order,
    archived: false,
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  }
}

/** Apply a name / order patch; lane moves go through the store (they cascade to member tasks). */
export function patchGroupRecord(
  current: DeskTaskGroup,
  patch: GroupPatch,
  meta: { readonly expectedRevision: number; readonly now: string },
): DeskTaskGroup {
  if (!Number.isInteger(meta.expectedRevision) || current.revision !== meta.expectedRevision) {
    throw new DeskModelError(
      'REVISION_CONFLICT',
      `分组已被修改（当前 revision ${current.revision}，请求 ${meta.expectedRevision}）`,
    )
  }
  const next: {
    id: string
    kind: 'group'
    schema: number
    name: string
    status: TaskStatus
    order: number
    archived: boolean
    createdAt: string
    updatedAt: string
    revision: number
  } = { ...current, revision: current.revision + 1, updatedAt: meta.now }
  if (patch.name !== undefined) {
    const name = normalizeGroupName(patch.name)
    if (name === undefined) throw new DeskModelError('INVALID_GROUP', '分组名不能为空')
    next.name = name
  }
  const order = normalizeOrder(patch.order)
  if (order !== undefined) next.order = order
  if (patch.archived !== undefined) {
    if (typeof patch.archived !== 'boolean') throw new DeskModelError('INVALID_GROUP', 'archived 必须是布尔值')
    next.archived = patch.archived
  }
  return next
}

/** Group order inside a lane: manual order, then creation time, then id (stable fallback). */
export function sortGroups(groups: readonly DeskTaskGroup[]): DeskTaskGroup[] {
  return [...groups].sort((left, right) =>
    left.order - right.order
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id))
}

/** Keyword filter over group names (case-insensitive); empty query returns all. */
export function filterGroups(groups: readonly DeskTaskGroup[], query: string | undefined): DeskTaskGroup[] {
  const text = (query ?? '').trim().toLowerCase()
  if (text === '') return [...groups]
  return groups.filter(group => group.name.toLowerCase().includes(text))
}

