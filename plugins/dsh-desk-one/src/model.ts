/**
 * Pure logic of the unified object model (imports no Node / browser API, so `node:test` can drive it directly):
 * input normalization, object creation, patching with optimistic concurrency, sorting and filtering.
 * On the note wall the body is the only content; title is derived from the body's first line and kept for the
 * agent tools and list display.
 */

import {
  DESK_NODE_SCHEMA, MAX_BODY_CHARS, MAX_GROUP_CHARS, MAX_TASK_SESSIONS, MAX_TITLE_CHARS, NOTE_COLORS, NOTE_MAX_SIZE,
  NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH, TASK_STATUSES,
} from './constants.js'
import type { DeskNote, DeskTask, DeskTaskGroup, NoteColor, TaskStatus } from './contract.js'

type DeskModelErrorCode =
  | 'INVALID_NOTE'
  | 'REVISION_CONFLICT'
  | 'UNKNOWN_NOTE'
  /** The note wall has reached its 100-note cap (product constraint, see constants.MAX_ACTIVE_NOTES). */
  | 'NOTE_LIMIT'
  /** The trash has reached its 200-note cap and must be emptied first (see constants.MAX_TRASH_NOTES). */
  | 'TRASH_FULL'
  | 'INVALID_TASK'
  | 'UNKNOWN_TASK'
  | 'INVALID_GROUP'
  | 'UNKNOWN_GROUP'
  /** Schedule module: input validation failure / unknown calendar (S2). */
  | 'INVALID_SCHEDULE'
  | 'UNKNOWN_CALENDAR'

/** Model-layer error: routes map it to HTTP status (400 / 409 / 404). */
export class DeskModelError extends Error {
  constructor(readonly code: DeskModelErrorCode, message: string) {
    super(message)
    this.name = 'DeskModelError'
  }
}

export interface NoteInput {
  readonly title: string
  readonly body: string
  readonly color: NoteColor
}

export interface NotePatch {
  readonly title?: string
  readonly body?: string
  readonly color?: string
  readonly pinned?: boolean
  readonly trashed?: boolean
  /** Free position on the note wall (px, relative to the wall canvas). */
  readonly x?: number
  readonly y?: number
  /** Note size (px): written back after the user resizes from the bottom-right corner. */
  readonly width?: number
  readonly height?: number
  /** Sticker layer: raised to max + 1 on click/drag, and persisted. */
  readonly z?: number
}

/** Derive the title from the body's first line (the note wall does not show title, but agent tools and search need it). */
function titleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/u).map(line => line.trim()).find(line => line !== '')
  return (firstLine ?? '').slice(0, 60)
}

function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === 'string' && (NOTE_COLORS as readonly string[]).includes(value)
}

/** Validate and normalize creation input: the note wall allows blank notes (click "+" first, then type). */
export function normalizeNoteInput(raw: { readonly title?: unknown; readonly body?: unknown; readonly color?: unknown }): NoteInput {
  const body = typeof raw.body === 'string' ? raw.body : ''
  const explicitTitle = typeof raw.title === 'string' ? raw.title.trim() : ''
  const color = raw.color === undefined || raw.color === '' ? 'default' : raw.color
  if (!isNoteColor(color)) throw new DeskModelError('INVALID_NOTE', `未知的便签颜色：${String(raw.color)}`)
  if (body.length > MAX_BODY_CHARS) {
    throw new DeskModelError('INVALID_NOTE', `便签正文超过 ${MAX_BODY_CHARS} 字符上限`)
  }
  if (explicitTitle.length > MAX_TITLE_CHARS) {
    throw new DeskModelError('INVALID_NOTE', `便签标题超过 ${MAX_TITLE_CHARS} 字符上限`)
  }
  return { title: explicitTitle === '' ? titleFromBody(body) : explicitTitle, body, color }
}

/** Valid coordinate: finite non-negative; invalid values are ignored (position is display-only, a bad value should not block the whole note). */
export function normalizeCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined
}

/** Valid size: clamped to [min, NOTE_MAX_SIZE]; invalid values are ignored (current / default size is kept). */
function normalizeSize(value: unknown, min: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(Math.min(Math.max(value, min), NOTE_MAX_SIZE))
}

/** Valid layer: non-negative integer; invalid values are ignored. */
export function normalizeLayer(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.round(value)
}


/** Create a note object (id / time / coordinates / layer come from the caller, keeping this function pure). */
export function createNoteRecord(
  input: NoteInput,
  meta: { readonly id: string; readonly now: string; readonly x?: number; readonly y?: number; readonly z?: number },
): DeskNote {
  const x = normalizeCoordinate(meta.x)
  const y = normalizeCoordinate(meta.y)
  const z = normalizeLayer(meta.z)
  return {
    id: meta.id,
    kind: 'note',
    schema: DESK_NODE_SCHEMA,
    title: input.title,
    body: input.body,
    tags: [],
    color: input.color,
    pinned: false,
    trashed: false,
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(z === undefined ? {} : { z }),
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  }
}

/** Apply a patch and bump revision; a revision mismatch throws REVISION_CONFLICT (optimistic concurrency together with the store's serialized write chain). */
export function patchNoteRecord(
  current: DeskNote,
  patch: NotePatch,
  meta: { readonly expectedRevision: number; readonly now: string },
): DeskNote {
  if (!Number.isInteger(meta.expectedRevision) || current.revision !== meta.expectedRevision) {
    throw new DeskModelError(
      'REVISION_CONFLICT',
      `便签已被修改（当前 revision ${current.revision}，请求 ${meta.expectedRevision}）`,
    )
  }
  const next: {
    id: string
    kind: 'note'
    schema: number
    title: string
    body: string
    tags: readonly string[]
    color: NoteColor
    pinned: boolean
    trashed: boolean
    x?: number
    y?: number
    width?: number
    height?: number
    z?: number
    createdAt: string
    updatedAt: string
    revision: number
  } = { ...current, revision: current.revision + 1, updatedAt: meta.now }

  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (title.length > MAX_TITLE_CHARS) {
      throw new DeskModelError('INVALID_NOTE', `便签标题超过 ${MAX_TITLE_CHARS} 字符上限`)
    }
    next.title = title
  }
  if (patch.body !== undefined) {
    if (patch.body.length > MAX_BODY_CHARS) {
      throw new DeskModelError('INVALID_NOTE', `便签正文超过 ${MAX_BODY_CHARS} 字符上限`)
    }
    next.body = patch.body
    // When the body changes and the caller gave no explicit title, the title follows the body's first line (keeping both consistent).
    if (patch.title === undefined) next.title = titleFromBody(patch.body)
  }
  if (patch.color !== undefined) {
    if (!isNoteColor(patch.color)) throw new DeskModelError('INVALID_NOTE', `未知的便签颜色：${patch.color}`)
    next.color = patch.color
  }
  if (patch.pinned !== undefined) {
    if (typeof patch.pinned !== 'boolean') throw new DeskModelError('INVALID_NOTE', 'pinned 必须是布尔值')
    next.pinned = patch.pinned
  }
  if (patch.trashed !== undefined) {
    if (typeof patch.trashed !== 'boolean') throw new DeskModelError('INVALID_NOTE', 'trashed 必须是布尔值')
    next.trashed = patch.trashed
  }
  const x = normalizeCoordinate(patch.x)
  const y = normalizeCoordinate(patch.y)
  if (x !== undefined) next.x = x
  if (y !== undefined) next.y = y
  const width = normalizeSize(patch.width, NOTE_MIN_WIDTH)
  const height = normalizeSize(patch.height, NOTE_MIN_HEIGHT)
  if (width !== undefined) next.width = width
  if (height !== undefined) next.height = height
  const layer = normalizeLayer(patch.z)
  if (layer !== undefined) next.z = layer
  return next
}

/** Panel order: pinned first, then most recently updated, then id for a stable sort. */
export function sortNotes(notes: readonly DeskNote[]): DeskNote[] {
  return [...notes].sort((left, right) =>
    Number(right.pinned) - Number(left.pinned)
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.id.localeCompare(right.id))
}

/** Keyword filter (title + body, case-insensitive); an empty query returns everything unchanged. */
export function filterNotes(notes: readonly DeskNote[], query: string | undefined): DeskNote[] {
  const text = (query ?? '').trim().toLowerCase()
  if (text === '') return [...notes]
  return notes.filter(note => `${note.title}\n${note.body}`.toLowerCase().includes(text))
}

/* ------------------------------------------------------------------ */
/* Tasks: fixed three lanes, manual order, due date, archive           */
/* ------------------------------------------------------------------ */

export interface TaskInput {
  readonly title: string
  readonly body: string
  readonly status: TaskStatus
  readonly color: NoteColor
  readonly due?: { readonly date: string; readonly timezone?: string }
  readonly order: number
  readonly groupId?: string
  readonly sessionIds: readonly string[]
}

export interface TaskPatch {
  readonly title?: string
  readonly body?: string
  readonly status?: string
  readonly color?: string
  /** `null` clears the due date; `undefined` leaves it unchanged. */
  readonly due?: { readonly date: string; readonly timezone?: string } | null
  readonly order?: number
  readonly archived?: boolean
  /** `null` removes the task from its group; `undefined` leaves membership unchanged. */
  readonly groupId?: string | null
  /** Replaces the whole linked-session list; `undefined` leaves it unchanged. */
  readonly sessionIds?: readonly string[]
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

/** Accept only real calendar days in `YYYY-MM-DD` (2026-02-31 must not silently roll over). */
function isValidDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function normalizeDue(raw: { readonly date?: unknown; readonly timezone?: unknown }): { date: string; timezone?: string } {
  if (typeof raw.date !== 'string' || !isValidDueDate(raw.date)) {
    throw new DeskModelError('INVALID_TASK', '截止日期必须是合法的 YYYY-MM-DD')
  }
  const timezone = typeof raw.timezone === 'string' ? raw.timezone.trim() : ''
  return { date: raw.date, ...(timezone === '' ? {} : { timezone }) }
}

/** Non-negative integer order; invalid values are ignored (display order falls back to creation). */
function normalizeOrder(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.round(value)
}

/** One-level group name: trimmed, blank means "no name", overlength is rejected. */
function normalizeGroupName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  if (name === '') return undefined
  if (name.length > MAX_GROUP_CHARS) {
    throw new DeskModelError('INVALID_GROUP', `分组名超过 ${MAX_GROUP_CHARS} 字符上限`)
  }
  return name
}

/** Membership id: non-empty trimmed string (the group record itself is validated by the store). */
function normalizeGroupId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return id === '' ? undefined : id
}

/** Linked session ids: opaque strings, deduplicated in order, bounded so a card stays readable. */
function normalizeSessionIds(value: unknown): readonly string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new DeskModelError('INVALID_TASK', 'sessionIds 必须是字符串数组')
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new DeskModelError('INVALID_TASK', 'sessionIds 必须是字符串数组')
    const id = item.trim()
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  if (ids.length > MAX_TASK_SESSIONS) {
    throw new DeskModelError('INVALID_TASK', `一张任务卡最多关联 ${MAX_TASK_SESSIONS} 个会话`)
  }
  return ids
}

/**
 * Task titles are required: unlike notes (where the body is the content), a task without a title
 * has no meaningful card. The rest mirrors the note validator's "reject bad enum, clamp text" style.
 */
export function normalizeTaskInput(raw: {
  readonly title?: unknown
  readonly body?: unknown
  readonly status?: unknown
  readonly color?: unknown
  readonly dueDate?: unknown
  readonly dueTimezone?: unknown
  readonly order?: unknown
  readonly groupId?: unknown
  readonly sessionIds?: unknown
}): TaskInput {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (title === '') throw new DeskModelError('INVALID_TASK', '任务需要标题')
  if (title.length > MAX_TITLE_CHARS) {
    throw new DeskModelError('INVALID_TASK', `任务标题超过 ${MAX_TITLE_CHARS} 字符上限`)
  }
  const body = typeof raw.body === 'string' ? raw.body : ''
  if (body.length > MAX_BODY_CHARS) {
    throw new DeskModelError('INVALID_TASK', `任务描述超过 ${MAX_BODY_CHARS} 字符上限`)
  }
  const status = raw.status === undefined || raw.status === '' ? 'todo' : raw.status
  if (!isTaskStatus(status)) throw new DeskModelError('INVALID_TASK', `未知的任务状态：${String(raw.status)}`)
  const color = raw.color === undefined || raw.color === '' ? 'default' : raw.color
  if (!isNoteColor(color)) throw new DeskModelError('INVALID_TASK', `未知的任务颜色：${String(raw.color)}`)
  const due = raw.dueDate === undefined
    ? undefined
    : normalizeDue({ date: raw.dueDate, timezone: raw.dueTimezone })
  const groupId = normalizeGroupId(raw.groupId)
  return {
    title,
    body,
    status,
    color,
    ...(due === undefined ? {} : { due }),
    order: normalizeOrder(raw.order) ?? 0,
    ...(groupId === undefined ? {} : { groupId }),
    sessionIds: normalizeSessionIds(raw.sessionIds),
  }
}

/** Create a task record (pure: id / time come from the caller). */
export function createTaskRecord(
  input: TaskInput,
  meta: { readonly id: string; readonly now: string },
): DeskTask {
  return {
    id: meta.id,
    kind: 'task',
    schema: DESK_NODE_SCHEMA,
    title: input.title,
    body: input.body,
    tags: [],
    status: input.status,
    color: input.color,
    ...(input.due === undefined ? {} : { due: input.due }),
    order: input.order,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    sessionIds: input.sessionIds,
    archived: false,
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  }
}

/** Apply a task patch; revision mismatch -> REVISION_CONFLICT (optimistic concurrency). */
export function patchTaskRecord(
  current: DeskTask,
  patch: TaskPatch,
  meta: { readonly expectedRevision: number; readonly now: string },
): DeskTask {
  if (!Number.isInteger(meta.expectedRevision) || current.revision !== meta.expectedRevision) {
    throw new DeskModelError(
      'REVISION_CONFLICT',
      `任务已被修改（当前 revision ${current.revision}，请求 ${meta.expectedRevision}）`,
    )
  }
  const next: {
    id: string
    kind: 'task'
    schema: number
    title: string
    body: string
    tags: readonly string[]
    status: TaskStatus
    color: NoteColor
    due?: { date: string; timezone?: string }
    order: number
    archived: boolean
    groupId?: string
    sessionIds: readonly string[]
    projectId?: string
    laneId?: string
    createdAt: string
    updatedAt: string
    revision: number
  } = { ...current, revision: current.revision + 1, updatedAt: meta.now }

  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (title === '') throw new DeskModelError('INVALID_TASK', '任务标题不能为空')
    if (title.length > MAX_TITLE_CHARS) {
      throw new DeskModelError('INVALID_TASK', `任务标题超过 ${MAX_TITLE_CHARS} 字符上限`)
    }
    next.title = title
  }
  if (patch.body !== undefined) {
    if (patch.body.length > MAX_BODY_CHARS) {
      throw new DeskModelError('INVALID_TASK', `任务描述超过 ${MAX_BODY_CHARS} 字符上限`)
    }
    next.body = patch.body
  }
  if (patch.status !== undefined) {
    if (!isTaskStatus(patch.status)) throw new DeskModelError('INVALID_TASK', `未知的任务状态：${patch.status}`)
    next.status = patch.status
  }
  if (patch.color !== undefined) {
    if (!isNoteColor(patch.color)) throw new DeskModelError('INVALID_TASK', `未知的任务颜色：${patch.color}`)
    next.color = patch.color
  }
  if (patch.due === null) {
    delete next.due
  } else if (patch.due !== undefined) {
    next.due = normalizeDue(patch.due)
  }
  const order = normalizeOrder(patch.order)
  if (order !== undefined) next.order = order
  if (patch.archived !== undefined) {
    if (typeof patch.archived !== 'boolean') throw new DeskModelError('INVALID_TASK', 'archived 必须是布尔值')
    next.archived = patch.archived
  }
  if (patch.groupId === null) {
    delete next.groupId
  } else if (patch.groupId !== undefined) {
    const groupId = normalizeGroupId(patch.groupId)
    if (groupId === undefined) delete next.groupId
    else next.groupId = groupId
  }
  if (patch.sessionIds !== undefined) next.sessionIds = normalizeSessionIds(patch.sessionIds)
  return next
}

/** Board order: manual order first, then creation time, then id (stable fallback). */
export function sortTasks(tasks: readonly DeskTask[]): DeskTask[] {
  return [...tasks].sort((left, right) =>
    left.order - right.order
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id))
}

/** Keyword filter over title + body (case-insensitive); empty query returns all. */
export function filterTasks(tasks: readonly DeskTask[], query: string | undefined): DeskTask[] {
  const text = (query ?? '').trim().toLowerCase()
  if (text === '') return [...tasks]
  return tasks.filter(task => `${task.title}\n${task.body}`.toLowerCase().includes(text))
}

/* ------------------------------------------------------------------ */
/* Task groups: first-class entities, one level, owned by a lane      */
/* ------------------------------------------------------------------ */

interface GroupInput {
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
