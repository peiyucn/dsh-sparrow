

import type { NoteReviewParams } from '../review-bridge.js'
import type { NotebookApi } from '../api.js'


const KEY_PREFIX = 'dsh-desk-one.review-tab.'


const MAX_MEMO_ENTRIES = 100


function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}


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


export function removeReviewTabParams(sessionId: string): void {
  const storage = browserStorage()
  if (storage === undefined) return
  try {
    storage.removeItem(`${KEY_PREFIX}${sessionId}`)
  } catch {

  }
}


export function pruneReviewTabParams(isLiveSession: (sessionId: string) => boolean): void {
  if (browserStorage() === undefined) return
  for (const key of memoStorageKeys()) {
    const sessionId = key.slice(KEY_PREFIX.length)
    if (!isLiveSession(sessionId)) removeReviewTabParams(sessionId)
  }
}


export function writeReviewTabParams(sessionId: string, params: NoteReviewParams): void {
  const storage = browserStorage()
  if (storage === undefined) return
  const key = `${KEY_PREFIX}${sessionId}`
  try {

    storage.removeItem(key)
    storage.setItem(key, JSON.stringify(params))
  } catch {

    return
  }
  enforceMemoCap(key)
}


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
