/**
 * Session ids opened by the notebook review flow.
 *
 * The conversation hint is a session-scoped dock, so it must only render for sessions we started
 * for a review — not for every new session. Ids are kept in memory for this client run.
 */

import type { NotebookApi } from './notebook/api.js'

const reviewSessionIds = new Set<string>()
const listeners = new Set<() => void>()
let hydrated = false
let hydrating: Promise<void> | undefined

/** Remember one session started for a note review. */
export function rememberReviewSession(sessionId: string): void {
  if (reviewSessionIds.has(sessionId)) return
  reviewSessionIds.add(sessionId)
  for (const listener of listeners) listener()
}

/**
 * Load the host's durable review-session markers once per page. A failure is silent: the memory
 * registry still covers everything opened in this run.
 */
export function hydrateReviewSessions(notebook: NotebookApi): void {
  if (hydrated || hydrating !== undefined) return
  hydrating = (async () => {
    try {
      const payload = await notebook.listReviewSessions()
      for (const sessionId of payload.sessionIds) rememberReviewSession(sessionId)
    } catch {
      // The hint is optional; the panel keeps working without persisted markers.
    } finally {
      hydrated = true
      hydrating = undefined
    }
  })()
}

/** Mark one review session locally (instant) and in host storage (durable across restarts). */
export function persistReviewSession(notebook: NotebookApi, input: {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId?: string
}): void {
  rememberReviewSession(input.sessionId)
  void notebook.markReviewSession(input).catch(() => {
    // Local memory still shows the hint; only the restart-persistent marker is lost.
  })
}

/** Whether the session was started by the review flow. */
export function isReviewSession(sessionId: string): boolean {
  return reviewSessionIds.has(sessionId)
}

/** Observe the registry so the conversation hint can appear after a review tab mounts. */
export function subscribeReviewSessions(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
