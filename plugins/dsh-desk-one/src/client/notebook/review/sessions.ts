/**
 * Session ids opened by the notebook review flow, plus the durable note identity of each one.
 *
 * Two consumers share the registry: session-scoped decorations (the composer hint and the sidebar
 * row icon) only need "is this a review Session", while opening a note again needs to find that
 * note's existing review Session. The host storage marker carries the note `fileId`, so the same
 * file reopens its own conversation instead of starting a new one; both maps are filled by the
 * one-shot host hydration and kept current whenever a review tab mounts.
 */

import type { NotebookApi } from '../api.js'
import type { ReviewSessionInfo } from '../../../notebook-contract.js'

const reviewSessionIds = new Set<string>()
/** Latest known marker per Session id: durable note identity for reopening. */
const markers = new Map<string, ReviewSessionInfo>()
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
 * Load the host's durable review-session markers once per page. Single-flight: concurrent callers
 * share the pending request. The one-shot flag is set only after a successful load, so a failed
 * attempt (host not ready, transient error) is retried by the next caller instead of disabling
 * reuse and the sidebar marks for the rest of the page; the memory registry still covers this run.
 */
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
      // Leave `hydrated` unset: the next caller retries, and the memory registry keeps working.
    } finally {
      hydrating = undefined
    }
  })()
}

/** Resolve once the durable markers had their chance to load, so a fast first click still sees them. */
export function reviewSessionsReady(): Promise<void> {
  return hydrating ?? Promise.resolve()
}

/** Mark one review session locally (instant) and in host storage (durable across restarts). */
export function persistReviewSession(notebook: NotebookApi, input: {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly fileId?: string
}): void {
  const previous = markers.get(input.sessionId)
  const workspaceId = input.workspaceId ?? previous?.workspaceId
  // First binding wins: the same Session must not silently switch to another note (the official
  // workspace flow may hand a blank Session to a second note). The tab's own params/baseline carry
  // the actual note identity, and the marker keeps the original note's reuse entry.
  const fileId = previous?.fileId ?? input.fileId
  markers.set(input.sessionId, {
    sessionId: input.sessionId,
    updatedAt: new Date().toISOString(),
    ...workspaceId === undefined ? {} : { workspaceId },
    ...fileId === undefined ? {} : { fileId },
  })
  rememberReviewSession(input.sessionId)
  void notebook.markReviewSession(input).catch(() => {
    // Local memory still shows the hint; only the restart-persistent marker is lost.
  })
}

/** Whether the session was started by the review flow. */
export function isReviewSession(sessionId: string): boolean {
  return reviewSessionIds.has(sessionId)
}

/** Durable markers for one note file, newest first. */
export function reviewSessionCandidates(fileId: string): ReviewSessionInfo[] {
  return [...markers.values()]
    .filter(info => info.fileId === fileId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

/** What the live Session catalog says about one reuse candidate. */
export interface ReusableSessionFacts {
  /** The Session still exists and is not archived. */
  readonly openable: boolean
  /** Known turn count; greater than zero means the Session carries a real conversation. */
  readonly turns?: number
}

/**
 * Pick the review Session of one note to reopen.
 *
 * Newest first, but a 0-turn Session is only used when every candidate has no conversation: the old
 * "new Session per click" behaviour left blank duplicates behind, and those must not shadow the
 * note's real conversation.
 * @param candidates - markers for that note, newest first.
 * @param workspaceId - workspace the note library is linked to.
 * @param inspect - live catalog facts for one candidate Session.
 * @returns the Session id to reuse, or undefined when a new Session must start.
 */
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

/** Observe the registry so the conversation hint can appear after a review tab mounts. */
export function subscribeReviewSessions(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
