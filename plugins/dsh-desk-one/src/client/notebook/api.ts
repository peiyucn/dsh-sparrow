/**
 * Browser-side notebook data surface: the notes library index and its root setting.
 *
 * The library itself lives on disk and the index is derived host-side; this module
 * only carries JSON over the plugin's own REST routes (read-only, no file writes).
 */

import { ROUTES } from '../../constants.js'
import type { NotebookSearchResponse, NotebookStateResponse } from '../../contract.js'
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

/** The injected facade shape the panel receives. */
export interface NotebookApi {
  readonly state: typeof notebookState
  readonly setRoot: typeof setNotebookRoot
  readonly clearRoot: typeof clearNotebookRoot
  readonly search: typeof searchNotebook
}

/** One facade object handed to the page through `DeskPanelInjected`. */
export const notebookApi: NotebookApi = {
  state: notebookState,
  setRoot: setNotebookRoot,
  clearRoot: clearNotebookRoot,
  search: searchNotebook,
}
