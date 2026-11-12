/**
 * Browser-side notebook surface: library state, root setting, page reads, and the draft box.
 * Review state itself lives in the conversation; this module only moves JSON over the plugin routes.
 */

import { ROUTES } from '../../constants.js'
import type {
  NoteDraft, NoteDraftResponse, NotebookPageResponse, NotebookRootRequest, NotebookSearchResponse, NotebookStateResponse,
} from '../../notebook-contract.js'
import { deleteJson, fetchJson, postJson } from '../http.js'

/** Root, counts and newest pages. */
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

/** Search titles / paths, optionally narrowed by a count filter or frontmatter values. */
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

/** Read one page for the review tab. */
export function notebookPage(path: string): Promise<NotebookPageResponse> {
  return fetchJson<NotebookPageResponse>(`${ROUTES.notebookPage}?path=${encodeURIComponent(path)}`)
}

/** One file's persisted draft box. */
export function getNoteDraft(cwd: string, path: string): Promise<NoteDraft | null> {
  const params = new URLSearchParams({ cwd, path })
  return fetchJson<NoteDraftResponse>(`${ROUTES.notebookDraft}?${params.toString()}`).then(payload => payload.draft)
}

/** Replace one file's draft box. */
export function saveNoteDraft(input: {
  readonly cwd: string
  readonly path: string
  readonly drafts: NoteDraft['drafts']
}): Promise<NoteDraft> {
  return postJson<NoteDraftResponse>(ROUTES.notebookDraft, input).then(payload => {
    if (payload.draft === null) throw new Error('草稿保存失败')
    return payload.draft
  })
}

/** The injected facade shape the panel and review tab receive. */
export interface NotebookApi {
  readonly state: typeof notebookState
  readonly setRoot: typeof setNotebookRoot
  readonly clearRoot: typeof clearNotebookRoot
  readonly search: typeof searchNotebook
  readonly page: typeof notebookPage
  readonly draft: typeof getNoteDraft
  readonly saveDraft: typeof saveNoteDraft
}

/** One facade object handed to the page through `DeskPanelInjected`. */
export const notebookApi: NotebookApi = {
  state: notebookState,
  setRoot: setNotebookRoot,
  clearRoot: clearNotebookRoot,
  search: searchNotebook,
  page: notebookPage,
  draft: getNoteDraft,
  saveDraft: saveNoteDraft,
}
