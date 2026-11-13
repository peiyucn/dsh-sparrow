/** Browser-side data surface: goes only through the host's own REST routes (the client never touches storage directly). */

import { ROUTES } from '../../constants.js'
import type { DeskNote, NoteDeleteResponse, NoteListResponse, NoteMutationResponse } from '../../contract.js'
import { fetchJson, postJson } from '../http.js'

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
