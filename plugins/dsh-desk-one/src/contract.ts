/**
 * host 与 client 共用的跨端契约（只含类型与纯常量，不得 import 运行时模块）。
 * S0 的落地对象是便签；任务 / 日程的字段按 `01-object-model.md` 逐步扩展。
 */

import type { NOTE_COLORS, TASK_STATUSES } from './constants.js'

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
  /** 列内手动顺序：越大越靠后；拖拽即重排。 */
  readonly order: number
  /** 一层分组名；缺省表示未分组（S1 只支持一层）。 */
  readonly group?: string
  /** 存档后从板上消失，进任务板存档视图（命名避开宿主「会话归档」）。 */
  readonly archived: boolean
  /** 预留：多板 / 自定义泳道后启用，S1 不写。 */
  readonly projectId?: string
  readonly laneId?: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly revision: number
}

/** 统一对象：存储域一张 nodes 表按 kind 判别（加 kind 只扩 schema，不改表）。 */
export type DeskNode = DeskNote | DeskTask

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
  /** 一层分组名；缺省不分组。 */
  readonly group?: string
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
  readonly group?: string | null
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
