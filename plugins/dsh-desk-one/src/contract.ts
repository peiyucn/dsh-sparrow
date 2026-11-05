/**
 * host 与 client 共用的跨端契约（只含类型与纯常量，不得 import 运行时模块）。
 * S0 的落地对象是便签；任务 / 日程的字段按 `01-object-model.md` 逐步扩展。
 */

import type { NOTE_COLORS } from './constants.js'

export type NoteColor = (typeof NOTE_COLORS)[number]

/**
 * 便签对象（S0 唯一的 DeskNode kind）。字段与 spec 的 Node 基础字段对齐：
 * `id / kind / schema / title / body / tags / createdAt / updatedAt / revision` 是核心，
 * 便签特有字段（color / pinned / archived）在 S0 直接放对象上；后续引入 payload 分层时随迁移补。
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
  readonly archived: boolean
  /** 便签墙自由位置（px，相对墙面画布）；缺省时界面按序号级联摆放。 */
  readonly x?: number
  readonly y?: number
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
}

export interface NotePatchRequest {
  readonly title?: string
  readonly body?: string
  readonly color?: string
  readonly pinned?: boolean
  readonly archived?: boolean
  readonly x?: number
  readonly y?: number
}

export interface UpdateNoteRequest {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: NotePatchRequest
}

export interface DeleteNoteRequest {
  readonly id: string
}

/** 统一错误体：与仓库其它插件的 `{ error: { code, message } }` 口径一致。 */
export interface ApiErrorPayload {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}
