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

/**
 * How many Session memos are kept. A memo is only a restore hint (the host markers are the durable
 * identity), so the oldest entries are evicted instead of letting the storage grow without bound.
 */
const MAX_MEMO_ENTRIES = 100

/** `localStorage` when the browser exposes it; the access itself may throw in restricted modes. */
function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** Keys of every stored memo, in storage order (oldest insertion first). */
function memoStorageKeys(): string[] {
  const storage = browserStorage()
  if (storage === undefined) return []
  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key !== null && key.startsWith(KEY_PREFIX)) keys.push(key)
    }
  } catch {
    return []
  }
  return keys
}

/** Read the remembered parameters of one Session, if any. */
export function readReviewTabParams(sessionId: string): NoteReviewParams | undefined {
  const storage = browserStorage()
  if (storage === undefined) return undefined
  try {
    const raw = storage.getItem(`${KEY_PREFIX}${sessionId}`)
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

/** Forget one Session's memo: its tab is gone, or the Session itself no longer exists. */
export function removeReviewTabParams(sessionId: string): void {
  const storage = browserStorage()
  if (storage === undefined) return
  try {
    storage.removeItem(`${KEY_PREFIX}${sessionId}`)
  } catch {
    // Storage disabled: nothing was stored, so nothing has to be removed.
  }
}

/**
 * Drop the memos of Sessions the Host no longer lists (a deleted Session can never restore its tab),
 * keeping the memo set from accumulating across runs.
 * @param isLiveSession - whether one Session still exists in the live catalog.
 */
export function pruneReviewTabParams(isLiveSession: (sessionId: string) => boolean): void {
  if (browserStorage() === undefined) return
  for (const key of memoStorageKeys()) {
    const sessionId = key.slice(KEY_PREFIX.length)
    if (!isLiveSession(sessionId)) removeReviewTabParams(sessionId)
  }
}

/** Remember one Session's review-tab parameters for the next restore. */
export function writeReviewTabParams(sessionId: string, params: NoteReviewParams): void {
  const storage = browserStorage()
  if (storage === undefined) return
  const key = `${KEY_PREFIX}${sessionId}`
  try {
    // Re-insert so the eviction order follows the latest write (storage keeps insertion order).
    storage.removeItem(key)
    storage.setItem(key, JSON.stringify(params))
  } catch {
    // Storage disabled: the tab still works during this run; only the restore memory is lost.
    return
  }
  enforceMemoCap(key)
}

/** Evict the oldest memos beyond {@link MAX_MEMO_ENTRIES}, never the one just written. */
function enforceMemoCap(keepKey: string): void {
  const keys = memoStorageKeys()
  const overflow = keys.length - MAX_MEMO_ENTRIES
  if (overflow <= 0) return
  let removed = 0
  for (const key of keys) {
    if (removed >= overflow) return
    if (key === keepKey) continue
    removeReviewTabParams(key.slice(KEY_PREFIX.length))
    removed += 1
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
