

import type { NOTE_COLORS, ScheduleChannel, ScheduleProvider, TASK_STATUSES } from './constants.js'
import type {
  DeskNotebookConfig, NoteBaseline, NoteDraft, NoteFileRef, ReviewRecord, ReviewSessionMarker,
} from './notebook-contract.js'

export type NoteColor = (typeof NOTE_COLORS)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]


export interface DeskNote {
  readonly id: string
  readonly kind: 'note'
  readonly schema: number
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly color: NoteColor
  readonly pinned: boolean

  readonly trashed: boolean

  readonly x?: number
  readonly y?: number

  readonly width?: number
  readonly height?: number

  readonly z?: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}


export interface DeskEdge {
  readonly id: string
  readonly type: string
  readonly from: string
  readonly to: string
  readonly createdAt: string
  readonly meta?: Readonly<Record<string, unknown>>
}


export interface DeskTask {
  readonly id: string
  readonly kind: 'task'
  readonly schema: number

  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly status: TaskStatus

  readonly color: NoteColor

  readonly due?: {
    readonly date: string
    readonly timezone?: string
  }

  readonly order: number

  readonly groupId?: string

  readonly sessionIds: readonly string[]

  readonly archived: boolean

  readonly projectId?: string
  readonly laneId?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}


export interface DeskTaskGroup {
  readonly id: string
  readonly kind: 'group'
  readonly schema: number
  readonly name: string
  readonly status: TaskStatus
  readonly order: number

  readonly archived: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}



export interface DeskSessionIndex {
  readonly id: string
  readonly kind: 'session'
  readonly schema: number
  readonly sessionId: string
  readonly title: string
  readonly cwd?: string
  readonly parentSessionId?: string
  readonly subagent: boolean
  readonly running: boolean
  readonly availability: 'available' | 'archived' | 'missing'

  readonly updatedAt: number
  readonly indexedAt: string
  readonly missingSince?: string
  readonly createdAt: string
  readonly revision: number
}

export type DeskNode =
  | DeskNote | DeskTask | DeskTaskGroup | DeskScheduleSource | DeskCalendar | DeskEvent | DeskSessionIndex
  | DeskNotebookConfig | NoteFileRef | NoteDraft | ReviewRecord | NoteBaseline | ReviewSessionMarker






export interface DeskScheduleSource {
  readonly id: string
  readonly kind: 'schedule-source'
  readonly schema: number
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel

  readonly account?: string

  readonly credentialRef?: string
  readonly enabled: boolean
  readonly syncState: 'idle' | 'syncing' | 'error'
  readonly lastSyncedAt?: string
  readonly lastError?: ScheduleSyncError
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

export interface ScheduleSyncError {
  readonly code: string
  readonly message: string
  readonly at: string
}


export interface DeskCalendar {
  readonly id: string
  readonly kind: 'calendar'
  readonly schema: number
  readonly sourceId: string
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel

  readonly remoteId: string
  readonly displayName: string
  readonly color: string

  readonly order: number
  readonly enabled: boolean
  readonly readOnly: true
  readonly syncToken?: string
  readonly lastSyncedAt?: string
  readonly lastError?: ScheduleSyncError
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}


export interface DeskEvent {
  readonly id: string
  readonly kind: 'event'
  readonly schema: number

  readonly calendarNodeId: string
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  readonly calendarRemoteId: string

  readonly externalId: string
  readonly uid: string
  readonly recurrenceId?: string
  readonly title: string
  readonly description?: string
  readonly location?: string

  readonly organizer?: string

  readonly attendees?: readonly string[]

  readonly start: string
  readonly end: string
  readonly allDay: boolean
  readonly timezone: string
  readonly busy: boolean
  readonly url?: string
  readonly rrule?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

export interface ScheduleStateResponse {
  readonly sources: readonly DeskScheduleSource[]
  readonly calendars: readonly DeskCalendar[]

  readonly counts: Readonly<Record<string, number>>
}

export interface ScheduleEventListResponse {
  readonly events: readonly DeskEvent[]

  readonly from: string
  readonly to: string
}

export interface ScheduleCalendarUpdateRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: {
    readonly color?: string
    readonly enabled?: boolean
    readonly order?: number
  }
}

export interface ScheduleConnectionInput {
  readonly provider: ScheduleProvider

  readonly account?: string

  readonly password?: string

  readonly url?: string
}


export interface OutlookLoginStartResponse {
  readonly flowId: string
  readonly kind?: 'device' | 'redirect'
  readonly authUrl?: string
  readonly userCode: string
  readonly verificationUri: string
  readonly expiresIn: number
  readonly interval: number
}

export interface OutlookLoginPollResponse {
  readonly status: 'pending' | 'connected'
  readonly message?: string
  readonly state?: ScheduleStateResponse
}

export interface ScheduleSubscriptionInput {
  readonly name?: string
  readonly url: string
}

export interface ScheduleConnectionTestResponse {
  readonly provider: ScheduleProvider
  readonly calendars: number
  readonly events: number
  readonly message: string
}

export interface ScheduleSyncSourceReport {
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  readonly ok: boolean
  readonly calendars: number
  readonly events: number
  readonly error?: ScheduleSyncError
}

export interface ScheduleSyncResponse {
  readonly syncedAt: string
  readonly sources: readonly ScheduleSyncSourceReport[]
}

export interface NoteListResponse {
  readonly notes: readonly DeskNote[]
}

export interface NoteMutationResponse {
  readonly note: DeskNote
}

export interface NoteDeleteResponse {
  readonly deleted: boolean
}

export interface CreateNoteRequest {
  readonly title?: string
  readonly body?: string
  readonly color?: string
  readonly x?: number
  readonly y?: number

  readonly z?: number
}

interface NotePatchRequest {
  readonly title?: string
  readonly body?: string
  readonly color?: string
  readonly pinned?: boolean
  readonly trashed?: boolean
  readonly x?: number
  readonly y?: number
  readonly width?: number
  readonly height?: number
  readonly z?: number
}

export interface UpdateNoteRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: NotePatchRequest
}

export interface DeleteNoteRequest {
  readonly id: string
}

export interface TaskListResponse {
  readonly tasks: readonly DeskTask[]
}

export interface TaskMutationResponse {
  readonly task: DeskTask
}

export interface TaskDeleteResponse {
  readonly deleted: boolean
}

export interface CreateTaskRequest {
  readonly title?: string
  readonly body?: string
  readonly status?: string
  readonly color?: string
  readonly dueDate?: string
  readonly dueTimezone?: string
  readonly order?: number

  readonly groupId?: string

  readonly sessionIds?: readonly string[]
}

export interface TaskPatchRequest {
  readonly title?: string
  readonly body?: string
  readonly status?: string
  readonly color?: string

  readonly due?: { readonly date: string; readonly timezone?: string } | null
  readonly order?: number
  readonly archived?: boolean

  readonly groupId?: string | null

  readonly sessionIds?: readonly string[]
}

export interface TaskGroupListResponse {
  readonly groups: readonly DeskTaskGroup[]
}

export interface TaskGroupMutationResponse {
  readonly group: DeskTaskGroup
}

export interface TaskGroupMoveResponse {
  readonly group: DeskTaskGroup

  readonly tasks: readonly DeskTask[]

  readonly groups: readonly DeskTaskGroup[]
}

export interface TaskGroupDeleteResponse {
  readonly deleted: boolean
}

export interface CreateTaskGroupRequest {
  readonly name?: string
  readonly status?: string
  readonly order?: number
}

export interface TaskGroupPatchRequest {
  readonly name?: string
  readonly order?: number
}

export interface UpdateTaskGroupRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: TaskGroupPatchRequest
}

export interface MoveTaskGroupRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly status: string
  readonly order?: number
}

export interface DeleteTaskGroupRequest {
  readonly id: string
}

export interface ArchiveTaskGroupRequest {
  readonly id: string
  readonly expectedRevision: number

  readonly archived: boolean
}

export interface UpdateTaskRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: TaskPatchRequest
}

export interface DeleteTaskRequest {
  readonly id: string
}


export interface ApiErrorPayload {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}
