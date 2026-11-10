/**
 * Cross-half contract shared by host and client (types and pure constants only; no runtime imports).
 * S0 ships notes; task / schedule fields expand step by step per `01-object-model.md`.
 */

import type { NOTE_COLORS, ScheduleChannel, ScheduleProvider, TASK_STATUSES } from './constants.js'

export type NoteColor = (typeof NOTE_COLORS)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * Note object (the only DeskNode kind in S0). Fields align with the spec's base Node fields:
 * `id / kind / schema / title / body / tags / createdAt / updatedAt / revision` are core;
 * note-specific fields (color / pinned / trashed) sit on the object in S0; they are added with the payload split in a later migration.
 */
export interface DeskNote {
  readonly id: string
  readonly kind: 'note'
  readonly schema: number
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly color: NoteColor
  readonly pinned: boolean
  /** Whether the note is in the trash (deleting a lightweight note trashes it first, recoverable). */
  readonly trashed: boolean
  /** Free position on the note wall (px, relative to the wall canvas); when absent the UI cascades by index. */
  readonly x?: number
  readonly y?: number
  /** Note size (px); defaults when absent, written back only after the user resizes from the bottom-right corner. */
  readonly width?: number
  readonly height?: number
  /** Sticker layer (higher is on top); falls back to list order when absent, written back only after a click/drag. */
  readonly z?: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** Edge object: not produced in S0, declared now to lock the domain layout (see the note in constants). */
export interface DeskEdge {
  readonly id: string
  readonly type: string
  readonly from: string
  readonly to: string
  readonly createdAt: string
  readonly meta?: Readonly<Record<string, unknown>>
}

/** Task object (S1): fixed three lanes + manual order within a column; the done column can collapse and archive. */
export interface DeskTask {
  readonly id: string
  readonly kind: 'task'
  readonly schema: number
  /** Title is required; a task has no existence apart from its title (detail / body are supplementary). */
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly status: TaskStatus
  /** Card color bar; reuses the five-color note palette. */
  readonly color: NoteColor
  /** Due date (day granularity only); absent means no due date. */
  readonly due?: {
    readonly date: string
    readonly timezone?: string
  }
  /** Manual order within the container: larger sorts later. Container = ungrouped area or a group. */
  readonly order: number
  /** Owning group id; absent means ungrouped (groups belong to a lane, so moving a card across columns removes it from its group). */
  readonly groupId?: string
  /**
   * Linked DSH session ids (opaque references, possibly several; one session may be linked by many cards).
   * Session title / running state are resolved live on the client and not persisted (to avoid stale snapshots).
   */
  readonly sessionIds: readonly string[]
  /** Disappears from the board once archived and moves to the task-board archive view (named to avoid the host's "session archive"). */
  readonly archived: boolean
  /** Reserved: enabled once multiple boards / custom lanes exist; not written in S1. */
  readonly projectId?: string
  readonly laneId?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/**
 * Task group (one level in S1): a group is an entity, not a tag on a card. It belongs to a lane and may be empty;
 * `order` is its position within that lane. Membership lives in `DeskTask.groupId`; deleting a group returns its members to ungrouped.
 */
export interface DeskTaskGroup {
  readonly id: string
  readonly kind: 'group'
  readonly schema: number
  readonly name: string
  readonly status: TaskStatus
  readonly order: number
  /** A group can be archived as a whole (done lane only); archiving also archives the cards inside it. */
  readonly archived: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** Unified object: one `nodes` table in the storage domain, discriminated by kind (adding a kind only extends the schema, not the table). */
/** Lightweight foreign-key index of a DSH session: no transcript, only searchable metadata. */
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
  /** Session creation/update timestamp (ms), not the index refresh time. */
  readonly updatedAt: number
  readonly indexedAt: string
  readonly missingSince?: string
  readonly createdAt: string
  readonly revision: number
}

export type DeskNode = DeskNote | DeskTask | DeskTaskGroup | DeskScheduleSource | DeskCalendar | DeskEvent | DeskSessionIndex | DeskNotebookConfig | DeskAnnotation

/* ------------------------------------------------------------------ */
/* Schedule (S2): read-only mirror of external calendars               */
/* ------------------------------------------------------------------ */

/** Sync source (connection level): one per provider + channel; no credential values in the record, only the `credentialRef` name. */
export interface DeskScheduleSource {
  readonly id: string
  readonly kind: 'schedule-source'
  readonly schema: number
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  /** Non-secret account identifier (email / Apple ID / the account that published the calendar link). */
  readonly account?: string
  /** Reference name in `ctx.credentials`; the value is kept by the official credential store. */
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

/** One remote calendar (a calendar under a sync source); always read-only in v1. */
export interface DeskCalendar {
  readonly id: string
  readonly kind: 'calendar'
  readonly schema: number
  readonly sourceId: string
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  /** Remote calendar id (the CalDAV collection URL / the ICS calendar identifier). */
  readonly remoteId: string
  readonly displayName: string
  readonly color: string
  /** Display order within the same source. */
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

/** One schedule entry (a mirror instance of a remote event; recurring events expand into several within the mirror window). */
export interface DeskEvent {
  readonly id: string
  readonly kind: 'event'
  readonly schema: number
  /** Id of the owning `DeskCalendar` node. */
  readonly calendarNodeId: string
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  readonly calendarRemoteId: string
  /** Part of the unique key: UID or `UID#RECURRENCE-ID`. */
  readonly externalId: string
  readonly uid: string
  readonly recurrenceId?: string
  readonly title: string
  readonly description?: string
  readonly location?: string
  /** ISO 8601 UTC; all-day events use the UTC converted from local day boundaries. */
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
  /** Mirrored event count per calendar (shown in the calendar source bar; counted by the host so the client does not rescan the whole table). */
  readonly counts: Readonly<Record<string, number>>
}

export interface ScheduleEventListResponse {
  readonly events: readonly DeskEvent[]
  /** The actual query window (ISO 8601 UTC); the client uses it to show the range. */
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
  /** WeCom / iCloud account (email or Apple ID). */
  readonly account?: string
  /** WeCom sync password / iCloud app-specific password; submitted only on save and never read back. */
  readonly password?: string
  /** ICS link of an Outlook personal published calendar. */
  readonly url?: string
}

/** One provider-agnostic ICS subscription; the URL is stored in the credential store. */
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
  /** Brings the new note to the top immediately: the client computes the layer as current max z + 1 and persists it. */
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
  /** Owning group id; absent means ungrouped. */
  readonly groupId?: string
  /** Linked session id list (may be multiple). */
  readonly sessionIds?: readonly string[]
}

export interface TaskPatchRequest {
  readonly title?: string
  readonly body?: string
  readonly status?: string
  readonly color?: string
  /** `null` clears the due date; absent leaves it unchanged. */
  readonly due?: { readonly date: string; readonly timezone?: string } | null
  readonly order?: number
  readonly archived?: boolean
  /** `null` removes it from its group; absent leaves it unchanged. */
  readonly groupId?: string | null
  /** Replaces the whole linked-session list; absent leaves it unchanged. */
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
  /** Member tasks whose status changed with the group when it crosses columns (empty array when reordering within the same column). */
  readonly tasks: readonly DeskTask[]
  /** The authoritative group list for the whole table after the move (lets the client renumber the block sequence without an extra GET). */
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
  /** true = archive (group + cards inside), false = restore. */
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

/** Unified error body: matches the `{ error: { code, message } }` shape used by other plugins in the repo. */
export interface ApiErrorPayload {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

/* ------------------------------------------------------------------ */
/* Notebook: local markdown library index (read-only projection)       */
/* ------------------------------------------------------------------ */

/**
 * The configured notes root. One record per profile (`id` is fixed), so the
 * library is a profile-level setting rather than a per-session one. The path is
 * absolute and never leaves this machine; it is not exported by `desk_export`.
 */
export interface DeskNotebookConfig {
  readonly id: string
  readonly kind: 'notebook-config'
  readonly schema: number
  /** Absolute directory of the notes library. */
  readonly rootPath: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** One indexed markdown page. Derived from disk on every scan; never persisted. */
export interface NoteIndexEntry {
  /** Path relative to the configured root, `/`-separated. */
  readonly path: string
  /** `frontmatter.title`, else the file stem. */
  readonly title: string
  /** `frontmatter.type` when present (`note` / `meeting` / `daily` / `task` …). */
  readonly type?: string
  /** `frontmatter.date` when present. */
  readonly date?: string
  readonly tags: readonly string[]
  readonly mtimeMs: number
  readonly bytes: number
  /** Whether the page opens with a YAML frontmatter block. */
  readonly hasFrontmatter: boolean
  /** Body characters after the frontmatter block (search/stats use it). */
  readonly bodyChars: number
}

/** Actionable counts shown on the shelf; they double as list filters. */
export interface NotebookStats {
  readonly total: number
  /** Pages without any frontmatter block. */
  readonly missingFrontmatter: number
  /** Pages whose body is empty or whitespace. */
  readonly emptyBody: number
}

/** Root validation result: a usable path, or the reason scanning is skipped. */
export interface NotebookRootState {
  readonly path: string
  /** `unset` before the user picks a folder; `outside-workspace` / `missing` explain a skipped scan. */
  readonly status: 'ok' | 'unset' | 'outside-workspace' | 'missing' | 'not-directory'
}

export interface NotebookStateResponse {
  readonly config: DeskNotebookConfig | null
  readonly root: NotebookRootState
  readonly stats: NotebookStats
  /** Newest pages first, bounded by `NOTEBOOK_STATE_LIMIT`. */
  readonly recent: readonly NoteIndexEntry[]
  /** True when the walk hit `NOTEBOOK_MAX_FILES` / `NOTEBOOK_MAX_DEPTH`. */
  readonly truncated: boolean
  /** ISO instant of the scan that produced this response. */
  readonly scannedAt: string
  /** Present when the scan itself failed (unreadable root); the panel shows it verbatim. */
  readonly error?: string
}

export interface NotebookRootRequest {
  /** Absolute directory the user picked. */
  readonly rootPath: string
}

export interface NotebookSearchResponse {
  readonly entries: readonly NoteIndexEntry[]
  /** Whether `NOTEBOOK_SEARCH_LIMIT` cut the result. */
  readonly truncated: boolean
}

/** One frontmatter field as the review tab lists it. */
export interface NotebookPageField {
  readonly name: string
  readonly value: string
}

/** One page's content, read on demand by the review tab (never cached in the store). */
export interface NotebookPageResponse {
  readonly path: string
  readonly fields: readonly NotebookPageField[]
  /** Body markdown after the frontmatter block. */
  readonly body: string
  readonly hasFrontmatter: boolean
  readonly bytes: number
}

/** Query parameters for the host-side full-library search. */
export interface NotebookSearchQuery {
  readonly query?: string
  readonly type?: string
  readonly tag?: string
  /** Only pages without a frontmatter block (the shelf's actionable count). */
  readonly missingFrontmatter?: boolean
  /** Only pages whose body is empty (the shelf's actionable count). */
  readonly emptyBody?: boolean
  readonly limit?: number
}

/* ------------------------------------------------------------------ */
/* Notebook: annotations (human review of AI-written pages)             */
/* ------------------------------------------------------------------ */

/** Annotation on one frontmatter field (AI-written metadata is reviewable too). */
export interface AnnotationFieldAnchor {
  readonly type: 'field'
  readonly field: string
  /** The value when the annotation was written (shown against the current value). */
  readonly value: string
}

/** Annotation on a quoted passage of the body, anchored by text quote (W3C-style). */
export interface AnnotationQuoteAnchor {
  readonly type: 'quote'
  readonly quote: string
  /** Up to ~32 characters before the quote, used to disambiguate repeats. */
  readonly prefix?: string
  /** Up to ~32 characters after the quote. */
  readonly suffix?: string
  /** Approximate character offset; only a tiebreaker, never trusted alone. */
  readonly position?: number
}

export type AnnotationAnchor = AnnotationFieldAnchor | AnnotationQuoteAnchor

/** One message in an annotation thread. */
export interface AnnotationComment {
  readonly author: 'human' | 'ai'
  readonly body: string
  /** ISO instant. */
  readonly at: string
}

/**
 * One review thread on a page. Lives in the Desk One store, never written back into the
 * markdown file; only a human moves `answered` to `resolved`.
 */
export interface DeskAnnotation {
  readonly id: string
  readonly kind: 'annotation'
  readonly schema: number
  /** Target page, relative to the notes root and `/`-separated. */
  readonly path: string
  readonly anchor: AnnotationAnchor
  readonly comments: readonly AnnotationComment[]
  readonly status: 'open' | 'answered' | 'resolved' | 'orphaned'
  /** Session that produced or is handling the thread. */
  readonly linkedSessionId?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

export interface AnnotationListResponse {
  readonly annotations: readonly DeskAnnotation[]
}

export interface AnnotationMutationResponse {
  readonly annotation: DeskAnnotation
}

export interface CreateAnnotationRequest {
  readonly path: string
  readonly anchor: AnnotationAnchor
  /** First comment, written by the human who selected the passage. */
  readonly body: string
  readonly linkedSessionId?: string
}

/** Status is the only field a reviewer patches directly; comments go through their own route. */
export interface AnnotationPatchRequest {
  readonly status?: string
}

export interface UpdateAnnotationRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: AnnotationPatchRequest
}

export interface ReplyAnnotationRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly body: string
  readonly author?: 'human' | 'ai'
}

export interface DeleteAnnotationRequest {
  readonly id: string
}
