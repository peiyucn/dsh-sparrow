/**
 * Remember one Session's review-tab navigation parameters.
 *
 * The official right sidebar persists a tab's layout entry (id/kind/title) but NOT its navigation
 * parameters. A Session reopened later therefore restores the「笔记审阅」tab with no note, which
 * used to render「没有指定文件」. This memo has the same lifetime as that layout (browser storage),
 * and two recovery sources cover tabs opened before the memo existed: the durable review-session
 * marker carries the note `fileId` + workspace, and the annotation records resolve that identity to
 * the current file path.
 */

import type { NoteReviewParams } from '../review-bridge.js'
import type { NotebookApi } from '../api.js'

/** Browser-storage key per Session (the official sidebar layout uses the same kind of storage). */
const KEY_PREFIX = 'dsh-desk-one.review-tab.'

/** Read the remembered parameters of one Session, if any. */
export function readReviewTabParams(sessionId: string): NoteReviewParams | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${sessionId}`)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const candidate = parsed as Record<string, unknown>
    if (typeof candidate.path !== 'string' || candidate.path === '') return undefined
    if (typeof candidate.fileId !== 'string' || candidate.fileId === '') return undefined
    if (typeof candidate.workspaceId !== 'string' || candidate.workspaceId === '') return undefined
    return { path: candidate.path, fileId: candidate.fileId, workspaceId: candidate.workspaceId }
  } catch {
    return undefined
  }
}

/** Remember one Session's review-tab parameters for the next restore. */
export function writeReviewTabParams(sessionId: string, params: NoteReviewParams): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${KEY_PREFIX}${sessionId}`, JSON.stringify(params))
  } catch {
    // Storage disabled: the tab still works during this run; only the restore memory is lost.
  }
}

/**
 * Recover a restored tab's parameters from host data: the review-session marker identifies the note,
 * and the annotation records resolve that identity to its current path.
 * @param notebook - notebook API (markers + review history).
 * @param sessionId - the Session whose review tab was restored without navigation parameters.
 * @returns the recoverable parameters, or undefined when the note cannot be resolved.
 */
export async function recoverReviewParams(
  notebook: NotebookApi,
  sessionId: string,
): Promise<NoteReviewParams | undefined> {
  try {
    const markers = await notebook.listReviewSessions()
    const marker = markers.sessions?.find(info => info.sessionId === sessionId)
    if (marker?.fileId === undefined || marker.workspaceId === undefined) return undefined
    const history = await notebook.history()
    const entry = history.entries.find(item => item.record.fileId === marker.fileId && item.resolvedPath !== undefined)
    if (entry?.resolvedPath === undefined) return undefined
    return { path: entry.resolvedPath, fileId: marker.fileId, workspaceId: marker.workspaceId }
  } catch {
    return undefined
  }
}
