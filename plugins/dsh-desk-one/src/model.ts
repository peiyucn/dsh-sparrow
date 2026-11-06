/**
 * 统一对象模型的纯逻辑（不 import Node / 浏览器 API，`node:test` 可直接驱动）：
 * 输入归一化、对象创建、补丁与乐观并发、排序与过滤。
 * 便签墙形态下 body 是唯一内容；title 由正文首行派生，保留给 agent 工具与列表展示。
 */

import {
  MAX_BODY_CHARS, MAX_TITLE_CHARS, NOTE_COLORS, NOTE_MAX_SIZE, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH,
} from './constants.js'
import type { DeskNote, NoteColor } from './contract.js'

export type DeskModelErrorCode = 'INVALID_NOTE' | 'REVISION_CONFLICT' | 'UNKNOWN_NOTE'

/** 模型层错误：路由据此映射 HTTP 状态（400 / 409 / 404）。 */
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
  readonly archived?: boolean
  /** 便签墙自由位置（px，相对墙面画布）。 */
  readonly x?: number
  readonly y?: number
  /** 便签尺寸（px）：用户拖右下角改大小后写回。 */
  readonly width?: number
  readonly height?: number
  /** 贴纸层级：点/拖后抬到最大 + 1，并持久化。 */
  readonly z?: number
}

/** 由正文首行派生标题（便签墙不展示 title，但 agent 工具与检索需要它）。 */
export function titleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/u).map(line => line.trim()).find(line => line !== '')
  return (firstLine ?? '').slice(0, 60)
}

function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === 'string' && (NOTE_COLORS as readonly string[]).includes(value)
}

/** 校验并归一化创建入参：便签墙允许空白便签（先「+」再打字）。 */
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

/** 合法坐标：有限非负数；非法一律忽略（位置只是展示属性，坏值不该挡住整条便签）。 */
export function normalizeCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined
}

/** 合法尺寸：夹到 [min, NOTE_MAX_SIZE]；非法一律忽略（沿用当前/默认尺寸）。 */
export function normalizeSize(value: unknown, min: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(Math.min(Math.max(value, min), NOTE_MAX_SIZE))
}

/** 合法层级：非负整数；非法一律忽略。 */
export function normalizeLayer(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.round(value)
}


/** 创建一条便签对象（id / 时间 / 坐标由调用方提供，保持本函数纯净）。 */
export function createNoteRecord(
  input: NoteInput,
  meta: { readonly id: string; readonly now: string; readonly x?: number; readonly y?: number },
): DeskNote {
  const x = normalizeCoordinate(meta.x)
  const y = normalizeCoordinate(meta.y)
  return {
    id: meta.id,
    kind: 'note',
    schema: 1,
    title: input.title,
    body: input.body,
    tags: [],
    color: input.color,
    pinned: false,
    archived: false,
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  }
}

/** 应用补丁并递增 revision；revision 不匹配抛 REVISION_CONFLICT（与存储写串行链配合做乐观并发）。 */
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
    archived: boolean
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
    // 正文变化且调用方没显式给标题时，标题跟随正文首行（保持两者一致）。
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
  if (patch.archived !== undefined) {
    if (typeof patch.archived !== 'boolean') throw new DeskModelError('INVALID_NOTE', 'archived 必须是布尔值')
    next.archived = patch.archived
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

/** 面板顺序：置顶优先，其次最近更新，最后按 id 稳定排序。 */
export function sortNotes(notes: readonly DeskNote[]): DeskNote[] {
  return [...notes].sort((left, right) =>
    Number(right.pinned) - Number(left.pinned)
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.id.localeCompare(right.id))
}

/** 关键词过滤（标题 + 正文，大小写不敏感）；空查询原样返回。 */
export function filterNotes(notes: readonly DeskNote[], query: string | undefined): DeskNote[] {
  const text = (query ?? '').trim().toLowerCase()
  if (text === '') return [...notes]
  return notes.filter(note => `${note.title}\n${note.body}`.toLowerCase().includes(text))
}
