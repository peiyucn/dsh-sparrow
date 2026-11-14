/**
 * Browser-side annotation surface: workspace-scoped opens, the landing summary, single-page reads,
 * the draft box, round baselines, review-session markers, and review history.
 */

import { ROUTES } from '../../constants.js'
import type {
  DraftAnnotation, MarkReviewSessionRequest, NoteDraft, NoteDraftResponse,
  NotebookBaselineResponse, NotebookFileResponse, NotebookPageResponse, NotebookSummaryResponse,
  RecordReviewRequest, ReviewHistoryResponse, ReviewRecord, ReviewSessionListResponse,
} from '../../notebook-contract.js'
import { deleteJson, fetchJson, postJson } from '../http.js'

/** Read the persisted round baseline for one file. */
export function loadReviewBaseline(sessionId: string): Promise<NotebookBaselineResponse> {
  return fetchJson<NotebookBaselineResponse>(`${ROUTES.notebookBaseline}?sessionId=${encodeURIComponent(sessionId)}`)
}

/** Persist the round baseline (host storage, survives clearing browser storage). */
export function saveReviewBaseline(input: {
  readonly sessionId: string
  readonly fileId: string
  readonly body: string
  readonly at: string
}): Promise<NotebookBaselineResponse> {
  return postJson<NotebookBaselineResponse>(ROUTES.notebookBaseline, input)
}

/** Resolve one workspace file and read it back (workspace-scoped annotation entry). */
export function openNotebookFile(input: {
  readonly workspaceId: string
  readonly path: string
}): Promise<NotebookFileResponse & { readonly page: NotebookPageResponse }> {
  return postJson<NotebookFileResponse & { page: NotebookPageResponse }>(ROUTES.notebookOpen, input)
}

/** Read one file back by its persisted identity (review-tab restore). */
export function openNotebookFileById(fileId: string): Promise<NotebookFileResponse & { readonly page: NotebookPageResponse }> {
  return fetchJson<NotebookFileResponse & { page: NotebookPageResponse }>(
    `${ROUTES.notebookOpenById}?fileId=${encodeURIComponent(fileId)}`,
  )
}

/** Landing page aggregates: pending drafts, submitted records, and recent reviews. */
export function notebookSummary(): Promise<NotebookSummaryResponse> {
  return fetchJson<NotebookSummaryResponse>(ROUTES.notebookSummary)
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
  /** Revision last seen; a mismatch fails with 409 instead of overwriting another pane's edits. */
  readonly expectedRevision?: number
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

/** The injected facade shape the landing page and review tab receive. */
export interface NotebookApi {
  readonly open: typeof openNotebookFile
  readonly openById: typeof openNotebookFileById
  readonly summary: typeof notebookSummary
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

/** One facade object handed to the panel through `DeskPanelInjected`. */
export const notebookApi: NotebookApi = {
  open: openNotebookFile,
  openById: openNotebookFileById,
  summary: notebookSummary,
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
