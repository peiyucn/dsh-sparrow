/**
 * Browser-side notebook surface: library state, root setting, page reads, file identity, the
 * draft box, and review history.
 */

import { ROUTES } from '../../constants.js'
import type {
  CreateNotebookNoteRequest, CreateNoteResponse, DraftAnnotation, MarkReviewSessionRequest, NoteDraft, NoteDraftResponse,
  NotebookBaselineResponse, ReviewSessionListResponse,
  NotebookFileResponse, NotebookListResponse, NotebookPageResponse, NotebookRootRequest, NotebookSearchResponse, NotebookStateResponse,
  RecordReviewRequest, ReviewHistoryResponse, ReviewRecord,
} from '../../notebook-contract.js'
import { deleteJson, fetchJson, postJson } from '../http.js'

/** Root, counts, newest pages, drafts and history usage. */
export function notebookState(): Promise<NotebookStateResponse> {
  return fetchJson<NotebookStateResponse>(ROUTES.notebookState)
}

/** Point the library at one workspace directory. */
export function setNotebookRoot(rootPath: string): Promise<NotebookStateResponse> {
  return postJson<NotebookStateResponse>(ROUTES.notebookRoot, { rootPath } satisfies NotebookRootRequest)
}

/** Forget the configured root (the index is derived). */
export function clearNotebookRoot(): Promise<NotebookStateResponse> {
  return deleteJson<NotebookStateResponse>(ROUTES.notebookRoot)
}

/** Choose the drafting skill (`null` = no skill). */
export function setNotebookSkill(name: string | null): Promise<NotebookStateResponse> {
  return postJson<NotebookStateResponse>(ROUTES.notebookSkill, { name })
}

/** Search titles / paths, optionally narrowed by a count filter. */
export function searchNotebook(input: {
  readonly query?: string
  readonly type?: string
  readonly tag?: string
  readonly missingFrontmatter?: boolean
  readonly emptyBody?: boolean
  readonly limit?: number
}): Promise<NotebookSearchResponse> {
  const params = new URLSearchParams()
  if (input.query !== undefined && input.query !== '') params.set('q', input.query)
  if (input.type !== undefined && input.type !== '') params.set('type', input.type)
  if (input.tag !== undefined && input.tag !== '') params.set('tag', input.tag)
  if (input.missingFrontmatter === true) params.set('missing', '1')
  if (input.emptyBody === true) params.set('empty', '1')
  if (input.limit !== undefined) params.set('limit', String(input.limit))
  const suffix = params.size === 0 ? '' : `?${params.toString()}`
  return fetchJson<NotebookSearchResponse>(`${ROUTES.notebookSearch}${suffix}`)
}

/** One page of the whole library (newest first) plus the total. */
export function listNotebook(input: {
  readonly offset?: number
  readonly limit?: number
  readonly missingFrontmatter?: boolean
}): Promise<NotebookListResponse> {
  const params = new URLSearchParams()
  if (input.offset !== undefined && input.offset > 0) params.set('offset', String(input.offset))
  if (input.limit !== undefined) params.set('limit', String(input.limit))
  if (input.missingFrontmatter === true) params.set('missing', '1')
  const suffix = params.size === 0 ? '' : `?${params.toString()}`
  return fetchJson<NotebookListResponse>(`${ROUTES.notebookList}${suffix}`)
}

/** Read the persisted round baseline for one file. */
export function loadReviewBaseline(fileId: string): Promise<NotebookBaselineResponse> {
  return fetchJson<NotebookBaselineResponse>(`${ROUTES.notebookBaseline}?fileId=${encodeURIComponent(fileId)}`)
}

/** Persist the round baseline (host storage, survives clearing browser storage). */
export function saveReviewBaseline(input: { readonly fileId: string; readonly body: string; readonly at: string }): Promise<NotebookBaselineResponse> {
  return postJson<NotebookBaselineResponse>(ROUTES.notebookBaseline, input)
}

/** Read one page for the review tab. */
export function notebookPage(path: string): Promise<NotebookPageResponse> {
  return fetchJson<NotebookPageResponse>(`${ROUTES.notebookPage}?path=${encodeURIComponent(path)}`)
}

/** Resolve (or lazily assign) one file identity. */
export function ensureNotebookFile(path: string): Promise<NotebookFileResponse> {
  return postJson<NotebookFileResponse>(ROUTES.notebookFile, { path })
}

/** Create one note file from the template. */
export function createNotebookNote(input: CreateNotebookNoteRequest): Promise<CreateNoteResponse> {
  return postJson<CreateNoteResponse>(ROUTES.notebookCreate, input)
}

/** One file's persisted draft box. */
export function getNoteDraft(fileId: string): Promise<NoteDraft | null> {
  return fetchJson<NoteDraftResponse>(`${ROUTES.notebookDraft}?fileId=${encodeURIComponent(fileId)}`)
    .then(payload => payload.draft)
}

/** Replace one file's draft box; an empty batch deletes it (`null`). */
export function saveNoteDraft(input: {
  readonly fileId: string
  readonly drafts: readonly DraftAnnotation[]
}): Promise<NoteDraft | null> {
  return postJson<NoteDraftResponse>(ROUTES.notebookDraft, input).then(payload => payload.draft)
}

/** Durable review-session markers (session ids only). */
export function listReviewSessions(): Promise<ReviewSessionListResponse> {
  return fetchJson<ReviewSessionListResponse>(ROUTES.notebookReviewSessions)
}

/** Mark one session as started by the review flow; idempotent, updates the timestamp. */
export function markReviewSession(input: MarkReviewSessionRequest): Promise<void> {
  return postJson<{ sessionId: string }>(ROUTES.notebookReviewSessions, input).then(() => undefined)
}

/** Submitted review history with current link state. */
export function notebookHistory(): Promise<ReviewHistoryResponse> {
  return fetchJson<ReviewHistoryResponse>(ROUTES.notebookHistory)
}

/** Record one submitted review. */
export function recordReview(input: RecordReviewRequest): Promise<ReviewRecord> {
  return postJson<{ record: ReviewRecord }>(ROUTES.notebookHistory, input).then(payload => payload.record)
}

/** Delete one history record. */
export function deleteReviewRecord(id: string): Promise<void> {
  return deleteJson<{ ok: boolean }>(ROUTES.notebookHistory, { id }).then(() => undefined)
}

/** The injected facade shape the panel and review tab receive. */
export interface NotebookApi {
  readonly state: typeof notebookState
  readonly setRoot: typeof setNotebookRoot
  readonly list: typeof listNotebook
  readonly clearRoot: typeof clearNotebookRoot
  readonly setSkill: typeof setNotebookSkill
  readonly search: typeof searchNotebook
  readonly page: typeof notebookPage
  readonly ensureFile: typeof ensureNotebookFile
  readonly createNote: typeof createNotebookNote
  readonly draft: typeof getNoteDraft
  readonly saveDraft: typeof saveNoteDraft
  readonly listReviewSessions: typeof listReviewSessions
  readonly markReviewSession: typeof markReviewSession
  readonly history: typeof notebookHistory
  readonly recordReview: typeof recordReview
  readonly deleteHistory: typeof deleteReviewRecord
  readonly loadBaseline: typeof loadReviewBaseline
  readonly saveBaseline: typeof saveReviewBaseline
}

/** One facade object handed to the page through `DeskPanelInjected`. */
export const notebookApi: NotebookApi = {
  state: notebookState,
  setRoot: setNotebookRoot,
  list: listNotebook,
  clearRoot: clearNotebookRoot,
  setSkill: setNotebookSkill,
  search: searchNotebook,
  page: notebookPage,
  ensureFile: ensureNotebookFile,
  createNote: createNotebookNote,
  draft: getNoteDraft,
  saveDraft: saveNoteDraft,
  listReviewSessions,
  markReviewSession,
  history: notebookHistory,
  recordReview,
  deleteHistory: deleteReviewRecord,
  loadBaseline: loadReviewBaseline,
  saveBaseline: saveReviewBaseline,
}
