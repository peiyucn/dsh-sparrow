/** 浏览器侧数据面：只走 host 自有 REST 路由（客户端不直接碰存储）。 */

import { REQUEST_TIMEOUT_MS, ROUTES } from '../../constants.js'
import type { ApiErrorPayload, DeskNote, NoteDeleteResponse, NoteListResponse, NoteMutationResponse } from '../../contract.js'

/** 带超时的 JSON 请求；非 2xx 抛带服务端 message 的错误（失败路径用户可见）。 */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const text = await response.text()
  let payload: T & Partial<ApiErrorPayload>
  try {
    payload = JSON.parse(text) as T & Partial<ApiErrorPayload>
  } catch {
    throw new Error(`请求失败（HTTP ${response.status}）：${text.slice(0, 160) || '响应不是 JSON'}`)
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  return payload
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function listNotes(query?: string): Promise<readonly DeskNote[]> {
  const trimmed = (query ?? '').trim()
  const suffix = trimmed === '' ? '' : `?q=${encodeURIComponent(trimmed)}`
  return fetchJson<NoteListResponse>(`${ROUTES.notes}${suffix}`).then(payload => payload.notes)
}

export function createNote(input: {
  readonly title?: string
  readonly body?: string
  readonly color?: string
  readonly x?: number
  readonly y?: number
  readonly z?: number
}): Promise<DeskNote> {
  return postJson<NoteMutationResponse>(ROUTES.notes, input).then(payload => payload.note)
}

export function updateNote(input: {
  readonly id: string
  readonly expectedRevision: number
  readonly patch: {
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
}): Promise<DeskNote> {
  return postJson<NoteMutationResponse>(ROUTES.noteUpdate, input).then(payload => payload.note)
}

export function deleteNote(id: string): Promise<void> {
  return postJson<NoteDeleteResponse>(ROUTES.noteDelete, { id }).then(() => undefined)
}
