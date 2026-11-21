

import { ROUTES } from '../../constants.js'
import type {
  DraftAnnotation, MarkReviewSessionRequest, NoteDraft, NoteDraftResponse,
  NotebookBaselineResponse, ReviewSessionListResponse,
  NotebookFileResponse, NotebookListResponse, NotebookPageResponse, NotebookRootRequest, NotebookSearchResponse, NotebookStateResponse,
  RecordReviewRequest, ReviewHistoryResponse, ReviewRecord,
} from '../../notebook-contract.js'
import { deleteJson, fetchJson, postJson } from '../http.js'


export function notebookState(): Promise<NotebookStateResponse> {
  return fetchJson<NotebookStateResponse>(ROUTES.notebookState)
}


export function setNotebookRoot(rootPath: string): Promise<NotebookStateResponse> {
  return postJson<NotebookStateResponse>(ROUTES.notebookRoot, { rootPath } satisfies NotebookRootRequest)
}


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


export function loadReviewBaseline(sessionId: string): Promise<NotebookBaselineResponse> {
  return fetchJson<NotebookBaselineResponse>(`${ROUTES.notebookBaseline}?sessionId=${encodeURIComponent(sessionId)}`)
}


export function saveReviewBaseline(input: {
  readonly sessionId: string
  readonly fileId: string
  readonly body: string
  readonly at: string
}): Promise<NotebookBaselineResponse> {
  return postJson<NotebookBaselineResponse>(ROUTES.notebookBaseline, input)
}


export function ensureNotebookFile(path: string): Promise<NotebookFileResponse> {
  return postJson<NotebookFileResponse>(ROUTES.notebookFile, { path })
}


export function getNoteDraft(fileId: string): Promise<NoteDraft | null> {
  return fetchJson<NoteDraftResponse>(`${ROUTES.notebookDraft}?fileId=${encodeURIComponent(fileId)}`)
    .then(payload => payload.draft)
}


export function saveNoteDraft(input: {
  readonly fileId: string
  readonly drafts: readonly DraftAnnotation[]

  readonly expectedRevision?: number
}): Promise<NoteDraft | null> {
  return postJson<NoteDraftResponse>(ROUTES.notebookDraft, input).then(payload => payload.draft)
}


export function listReviewSessions(): Promise<ReviewSessionListResponse> {
  return fetchJson<ReviewSessionListResponse>(ROUTES.notebookReviewSessions)
}


export function markReviewSession(input: MarkReviewSessionRequest): Promise<void> {
  return postJson<{ sessionId: string }>(ROUTES.notebookReviewSessions, input).then(() => undefined)
}

export function unmarkReviewSession(sessionId: string): Promise<void> {
  return deleteJson<{ ok: boolean }>(ROUTES.notebookReviewSessions, { sessionId }).then(() => undefined)
}


export function notebookHistory(): Promise<ReviewHistoryResponse> {
  return fetchJson<ReviewHistoryResponse>(ROUTES.notebookHistory)
}


export function recordReview(input: RecordReviewRequest): Promise<ReviewRecord> {
  return postJson<{ record: ReviewRecord }>(ROUTES.notebookHistory, input).then(payload => payload.record)
}


export function deleteReviewRecord(id: string): Promise<void> {
  return deleteJson<{ ok: boolean }>(ROUTES.notebookHistory, { id }).then(() => undefined)
}


export function openNotebookFile(input: {
  readonly workspaceId: string
  readonly path: string
}): Promise<NotebookFileResponse & { readonly page: NotebookPageResponse }> {
  return postJson<NotebookFileResponse & { page: NotebookPageResponse }>(ROUTES.notebookOpen, input)
}


export function openNotebookFileById(fileId: string): Promise<NotebookFileResponse & { readonly page: NotebookPageResponse }> {
  return fetchJson<NotebookFileResponse & { page: NotebookPageResponse }>(
    `${ROUTES.notebookOpenById}?fileId=${encodeURIComponent(fileId)}`,
  )
}


export interface NotebookApi {
  readonly state: typeof notebookState
  readonly setRoot: typeof setNotebookRoot
  readonly list: typeof listNotebook
  readonly search: typeof searchNotebook
  readonly ensureFile: typeof ensureNotebookFile
  readonly open: typeof openNotebookFile
  readonly openById: typeof openNotebookFileById
  readonly draft: typeof getNoteDraft
  readonly saveDraft: typeof saveNoteDraft
  readonly listReviewSessions: typeof listReviewSessions
  readonly markReviewSession: typeof markReviewSession
  readonly unmarkReviewSession: typeof unmarkReviewSession
  readonly history: typeof notebookHistory
  readonly recordReview: typeof recordReview
  readonly deleteHistory: typeof deleteReviewRecord
  readonly loadBaseline: typeof loadReviewBaseline
  readonly saveBaseline: typeof saveReviewBaseline
}


export const notebookApi: NotebookApi = {
  state: notebookState,
  setRoot: setNotebookRoot,
  list: listNotebook,
  search: searchNotebook,
  ensureFile: ensureNotebookFile,
  open: openNotebookFile,
  openById: openNotebookFileById,
  draft: getNoteDraft,
  saveDraft: saveNoteDraft,
  listReviewSessions,
  markReviewSession,
  unmarkReviewSession,
  history: notebookHistory,
  recordReview,
  deleteHistory: deleteReviewRecord,
  loadBaseline: loadReviewBaseline,
  saveBaseline: saveReviewBaseline,
}
