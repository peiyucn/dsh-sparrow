/**
 * Browser-side notebook data surface: the notes library index and its root setting.
 *
 * The library itself lives on disk and the index is derived host-side; this module
 * only carries JSON over the plugin's own REST routes (read-only, no file writes).
 */

import { ROUTES } from '../../constants.js'
import type {
  AnnotationListResponse, AnnotationMutationResponse, CreateAnnotationRequest, DeskAnnotation, NotebookPageResponse,
  DetectOrphansResponse, NotebookSearchResponse, NotebookStateResponse, ReplyAnnotationRequest, UpdateAnnotationRequest,
} from '../../contract.js'
import { deleteJson, fetchJson, postJson } from '../http.js'

/** Everything the shelf renders: root status, stats and the newest pages. */
export function notebookState(): Promise<NotebookStateResponse> {
  return fetchJson<NotebookStateResponse>(ROUTES.notebookState)
}

/** Point the library at a directory under a DSH workspace. */
export function setNotebookRoot(rootPath: string): Promise<NotebookStateResponse> {
  return postJson<NotebookStateResponse>(ROUTES.notebookRoot, { rootPath })
}

/** Forget the configured root (the index is derived, so nothing else is lost). */
export function clearNotebookRoot(): Promise<NotebookStateResponse> {
  return deleteJson<NotebookStateResponse>(ROUTES.notebookRoot)
}

/** Search titles / paths / bodies, optionally narrowed by `type`, `tag`, or a shelf count. */
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

/** Read one page for review (frontmatter fields + markdown body). */
export function notebookPage(path: string): Promise<NotebookPageResponse> {
  return fetchJson<NotebookPageResponse>(`${ROUTES.notebookPage}?path=${encodeURIComponent(path)}`)
}

/** Threads newest-first, optionally narrowed to one page or one status. */
export function listAnnotations(filter?: {
  readonly path?: string
  readonly status?: string
}): Promise<readonly DeskAnnotation[]> {
  const params = new URLSearchParams()
  if (filter?.path !== undefined && filter.path !== '') params.set('path', filter.path)
  if (filter?.status !== undefined && filter.status !== '') params.set('status', filter.status)
  const suffix = params.size === 0 ? '' : `?${params.toString()}`
  return fetchJson<AnnotationListResponse>(`${ROUTES.annotationList}${suffix}`).then(payload => payload.annotations)
}

/** Create one thread on a page. */
export function addAnnotation(input: CreateAnnotationRequest): Promise<DeskAnnotation> {
  return postJson<AnnotationMutationResponse>(`${ROUTES.annotationAdd}`, input).then(payload => payload.annotation)
}

/** Append one message to a thread. */
export function replyAnnotation(input: ReplyAnnotationRequest): Promise<DeskAnnotation> {
  return postJson<AnnotationMutationResponse>(ROUTES.annotationReply, input).then(payload => payload.annotation)
}

/** Change one thread's review status. */
export function updateAnnotationStatus(input: UpdateAnnotationRequest): Promise<DeskAnnotation> {
  return postJson<AnnotationMutationResponse>(ROUTES.annotationUpdate, input).then(payload => payload.annotation)
}

/** Ask the host to mark stale anchors orphaned, and return the settled list. */
export function detectOrphans(path: string): Promise<DetectOrphansResponse> {
  return postJson<DetectOrphansResponse>(ROUTES.annotationDetect, { path })
}

/** Delete one thread. */
export function deleteAnnotation(id: string): Promise<void> {
  return postJson<{ deleted: boolean }>(ROUTES.annotationDelete, { id }).then(() => undefined)
}

/** The injected facade shape the panel receives. */
export interface NotebookApi {
  readonly state: typeof notebookState
  readonly setRoot: typeof setNotebookRoot
  readonly clearRoot: typeof clearNotebookRoot
  readonly search: typeof searchNotebook
  readonly page: typeof notebookPage
  readonly listAnnotations: typeof listAnnotations
  readonly addAnnotation: typeof addAnnotation
  readonly replyAnnotation: typeof replyAnnotation
  readonly updateAnnotationStatus: typeof updateAnnotationStatus
  readonly detectOrphans: typeof detectOrphans
  readonly deleteAnnotation: typeof deleteAnnotation
}

/** One facade object handed to the page through `DeskPanelInjected`. */
export const notebookApi: NotebookApi = {
  state: notebookState,
  setRoot: setNotebookRoot,
  clearRoot: clearNotebookRoot,
  search: searchNotebook,
  page: notebookPage,
  listAnnotations,
  addAnnotation,
  replyAnnotation,
  updateAnnotationStatus,
  detectOrphans,
  deleteAnnotation,
}
