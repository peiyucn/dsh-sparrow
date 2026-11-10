/** Browser-side data surface: goes only through the host's own REST routes (the client never touches storage directly). */

import { REQUEST_TIMEOUT_MS, ROUTES } from '../../constants.js'
import type { ApiErrorPayload, DeskNote, NoteDeleteResponse, NoteListResponse, NoteMutationResponse } from '../../contract.js'

/** JSON request with a timeout; non-2xx throws an error carrying the server message (the failure path is user-visible). */
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
