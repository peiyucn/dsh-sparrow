

import type { NotebookApi } from '../api.js'
import type { ReviewSessionInfo } from '../../../notebook-contract.js'

const reviewSessionIds = new Set<string>()

const markers = new Map<string, ReviewSessionInfo>()
const listeners = new Set<() => void>()
let hydrated = false
let hydrating: Promise<void> | undefined


export function rememberReviewSession(sessionId: string): void {
  if (reviewSessionIds.has(sessionId)) return
  reviewSessionIds.add(sessionId)
  for (const listener of listeners) listener()
}


export function hydrateReviewSessions(notebook: NotebookApi): void {
  if (hydrated || hydrating !== undefined) return
  hydrating = (async () => {
    try {
      const payload = await notebook.listReviewSessions()
      for (const sessionId of payload.sessionIds) rememberReviewSession(sessionId)
      for (const info of payload.sessions ?? []) {
        markers.set(info.sessionId, info)
        rememberReviewSession(info.sessionId)
      }
      hydrated = true
    } catch {

    } finally {
      hydrating = undefined
    }
  })()
}


export function reviewSessionsReady(): Promise<void> {
  return hydrating ?? Promise.resolve()
}


export function persistReviewSession(notebook: NotebookApi, input: {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId?: string
}): void {
  const previous = markers.get(input.sessionId)
  const workspaceId = input.workspaceId ?? previous?.workspaceId



  const fileId = previous?.fileId ?? input.fileId
  markers.set(input.sessionId, {
    sessionId: input.sessionId,
    updatedAt: new Date().toISOString(),
    ...workspaceId === undefined ? {} : { workspaceId },
    ...fileId === undefined ? {} : { fileId },
  })
  rememberReviewSession(input.sessionId)
  void notebook.markReviewSession(input).catch(() => {

  })
}


export function forgetReviewSession(sessionId: string): void {
  const hadId = reviewSessionIds.delete(sessionId)
  const hadMarker = markers.delete(sessionId)
  if (!hadId && !hadMarker) return
  for (const listener of listeners) listener()
}


export function isReviewSession(sessionId: string): boolean {
  return reviewSessionIds.has(sessionId)
}


export function reviewSessionCandidates(fileId: string): ReviewSessionInfo[] {
  return [...markers.values()]
    .filter(info => info.fileId === fileId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}


export interface ReusableSessionFacts {

  readonly openable: boolean

  readonly turns?: number
}


export function pickReusableReviewSession(
  candidates: readonly ReviewSessionInfo[],
  workspaceId: string,
  inspect: (sessionId: string) => ReusableSessionFacts,
): string | undefined {
  const usable = candidates
    .filter(info => info.workspaceId === undefined || info.workspaceId === workspaceId)
    .map(info => ({ info, facts: inspect(info.sessionId) }))
    .filter(entry => entry.facts.openable)
  const preferred = usable.find(entry => (entry.facts.turns ?? 0) > 0)
  return (preferred ?? usable[0])?.info.sessionId
}


export function subscribeReviewSessions(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
