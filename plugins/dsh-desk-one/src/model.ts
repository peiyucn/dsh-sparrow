/**
 * 统一对象模型的纯逻辑（不 import Node / 浏览器 API，`node:test` 可直接驱动）：
 * 输入归一化、对象创建、补丁与乐观并发、排序与过滤。
 * 这里只做 S0 的 note kind；后续 kind 加同构函数，不改已有语义。
 */

import { MAX_BODY_CHARS, MAX_TITLE_CHARS, NOTE_COLORS } from './constants.js'
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
}

/** 未给标题时从正文首行取一个标题（与面板卡片展示一致）。 */
function titleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/u).map(line => line.trim()).find(line => line !== '')
  return (firstLine ?? '').slice(0, 60)
}

function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === 'string' && (NOTE_COLORS as readonly string[]).includes(value)
}

/** 校验并归一化创建入参：标题可为空（由正文首行补），标题与正文至少有一个。 */
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
  const title = explicitTitle === '' ? titleFromBody(body) : explicitTitle
  if (title === '') throw new DeskModelError('INVALID_NOTE', '便签需要标题或正文')
  return { title, body, color }
}

/** 创建一条便签对象（id 与时间由调用方提供，保持本函数纯净）。 */
export function createNoteRecord(input: NoteInput, meta: { readonly id: string; readonly now: string }): DeskNote {
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
    createdAt: string
    updatedAt: string
    revision: number
  } = { ...current, revision: current.revision + 1, updatedAt: meta.now }

  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (title === '') throw new DeskModelError('INVALID_NOTE', '便签标题不能为空')
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
