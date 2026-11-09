/**
 * host 与 client 共用的跨端契约（只含类型与纯常量，不得 import 运行时模块）。
 * S0 的落地对象是便签；任务 / 日程的字段按 `01-object-model.md` 逐步扩展。
 */

import type { NOTE_COLORS, ScheduleChannel, ScheduleProvider, TASK_STATUSES } from './constants.js'

export type NoteColor = (typeof NOTE_COLORS)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * 便签对象（S0 唯一的 DeskNode kind）。字段与 spec 的 Node 基础字段对齐：
 * `id / kind / schema / title / body / tags / createdAt / updatedAt / revision` 是核心，
 * 便签特有字段（color / pinned / trashed）在 S0 直接放对象上；后续引入 payload 分层时随迁移补。
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
  /** 是否在垃圾桶里（轻便签的删除是先进垃圾桶，可恢复）。 */
  readonly trashed: boolean
  /** 便签墙自由位置（px，相对墙面画布）；缺省时界面按序号级联摆放。 */
  readonly x?: number
  readonly y?: number
  /** 便签尺寸（px）；缺省用默认尺寸，用户拖右下角改过的才写回。 */
  readonly width?: number
  readonly height?: number
  /** 贴纸层级（越大越靠上）；缺省按列表顺序兜底，点/拖过才写回。 */
  readonly z?: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** 边对象：S0 不产出，先占住域布局（见 constants 的说明）。 */
export interface DeskEdge {
  readonly id: string
  readonly type: string
  readonly from: string
  readonly to: string
  readonly createdAt: string
  readonly meta?: Readonly<Record<string, unknown>>
}

/** 任务对象（S1）：固定三泳道 + 列内手动顺序，完成列可折叠、可存档。 */
export interface DeskTask {
  readonly id: string
  readonly kind: 'task'
  readonly schema: number
  /** 必填标题；任务没有一个可脱离标题的存在（详情 / 正文只是补充）。 */
  readonly title: string
  readonly body: string
  readonly tags: readonly string[]
  readonly status: TaskStatus
  /** 卡片颜色条；复用便签五色板。 */
  readonly color: NoteColor
  /** 截止日期（只到天）；缺省表示没有截止。 */
  readonly due?: {
    readonly date: string
    readonly timezone?: string
  }
  /** 容器内手动顺序：越大越靠后。容器 = 未分组区或某个分组。 */
  readonly order: number
  /** 所属分组 id；缺省表示未分组（分组属于泳道，跨列移动卡片会移出分组）。 */
  readonly groupId?: string
  /**
   * 关联的 DSH 会话 id（不透明引用，可多个；一个会话也可被多张卡关联）。
   * 会话标题 / 运行状态在客户端实时解析，不落库（避免快照过期）。
   */
  readonly sessionIds: readonly string[]
  /** 存档后从板上消失，进任务板存档视图（命名避开宿主「会话归档」）。 */
  readonly archived: boolean
  /** 预留：多板 / 自定义泳道后启用，S1 不写。 */
  readonly projectId?: string
  readonly laneId?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/**
 * 任务分组（S1 一层）：分组是实体，不是卡片上的标签。分组属于某个泳道，可以为空；
 * `order` 是组在所属泳道内的顺序。成员关系存于 `DeskTask.groupId`，删除分组时成员回未分组。
 */
export interface DeskTaskGroup {
  readonly id: string
  readonly kind: 'group'
  readonly schema: number
  readonly name: string
  readonly status: TaskStatus
  readonly order: number
  /** 分组可整组存档（仅完成列）；存档时组内卡片一起存档。 */
  readonly archived: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** 统一对象：存储域一张 nodes 表按 kind 判别（加 kind 只扩 schema，不改表）。 */
export type DeskNode = DeskNote | DeskTask | DeskTaskGroup | DeskScheduleSource | DeskCalendar | DeskEvent

/* ------------------------------------------------------------------ */
/* Schedule (S2): read-only mirror of external calendars               */
/* ------------------------------------------------------------------ */

/** 同步源（连接级）：一个 provider + 通道一条；凭据值不在记录里，只存 `credentialRef` 名字。 */
export interface DeskScheduleSource {
  readonly id: string
  readonly kind: 'schedule-source'
  readonly schema: number
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  /** 非密账号标识（邮箱 / Apple ID / 发布日历链接的来源账号）。 */
  readonly account?: string
  /** `ctx.credentials` 的引用名；值由官方凭据库保存。 */
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

/** 一个远端日历（同步源下的一本日历）；v1 恒只读。 */
export interface DeskCalendar {
  readonly id: string
  readonly kind: 'calendar'
  readonly schema: number
  readonly sourceId: string
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  /** 远端日历 id（CalDAV 的集合 URL / ICS 的日历标识）。 */
  readonly remoteId: string
  readonly displayName: string
  readonly color: string
  /** 同源内显示顺序。 */
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

/** 一条日程（远端事件的镜像实例；重复事件在镜像窗口内展开成多条）。 */
export interface DeskEvent {
  readonly id: string
  readonly kind: 'event'
  readonly schema: number
  /** 所属 `DeskCalendar` 节点的 id。 */
  readonly calendarNodeId: string
  readonly provider: ScheduleProvider
  readonly channel: ScheduleChannel
  readonly calendarRemoteId: string
  /** 唯一键的一部分：UID 或 `UID#RECURRENCE-ID`。 */
  readonly externalId: string
  readonly uid: string
  readonly recurrenceId?: string
  readonly title: string
  readonly description?: string
  readonly location?: string
  /** ISO 8601 UTC；全天事件用当地日边界换算后的 UTC。 */
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
  /** 每个日历的镜像事件数（日历源栏显示；由 host 统计，客户端不重复扫全表）。 */
  readonly counts: Readonly<Record<string, number>>
}

export interface ScheduleEventListResponse {
  readonly events: readonly DeskEvent[]
  /** 实际查询窗口（ISO 8601 UTC），客户端据此展示范围。 */
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
  /** 企业微信 / iCloud 的账号（邮箱或 Apple ID）。 */
  readonly account?: string
  /** 企业微信同步密码 / iCloud App 专用密码；只在保存时提交，不回读。 */
  readonly password?: string
  /** Outlook 个人发布日历的 ICS 链接。 */
  readonly url?: string
}

/** One provider-agnostic ICS subscription; the URL is stored in the credential store. */
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
  /** 新建时直接置顶：层级由客户端按当前最大 z + 1 计算并落库。 */
  readonly z?: number
}

export interface NotePatchRequest {
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
  /** 所属分组 id；缺省不分组。 */
  readonly groupId?: string
  /** 关联会话 id 列表（可多个）。 */
  readonly sessionIds?: readonly string[]
}

export interface TaskPatchRequest {
  readonly title?: string
  readonly body?: string
  readonly status?: string
  readonly color?: string
  /** `null` 表示清除截止日期；缺省表示不改。 */
  readonly due?: { readonly date: string; readonly timezone?: string } | null
  readonly order?: number
  readonly archived?: boolean
  /** `null` 表示移出分组；缺省表示不改。 */
  readonly groupId?: string | null
  /** 替换整份关联会话列表；缺省表示不改。 */
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
  /** 整组跨列时被一起改状态的成员任务（同列排序时为空数组）。 */
  readonly tasks: readonly DeskTask[]
  /** 移动后整表的权威分组列表（供客户端统一块序列重编号，避免额外 GET）。 */
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
  /** true = 存档（组 + 组内卡片），false = 恢复。 */
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

/** 统一错误体：与仓库其它插件的 `{ error: { code, message } }` 口径一致。 */
export interface ApiErrorPayload {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}
