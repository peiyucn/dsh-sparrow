/**
 * Session ids opened by the notebook review flow.
 *
 * The conversation hint is a session-scoped dock, so it must only render for sessions we started
 * for a review — not for every new session. Ids are kept in memory for this client run.
 */

const reviewSessionIds = new Set<string>()

/** Remember one session started for a note review. */
export function rememberReviewSession(sessionId: string): void {
  reviewSessionIds.add(sessionId)
}

/** Whether the session was started by the review flow. */
export function isReviewSession(sessionId: string): boolean {
  return reviewSessionIds.has(sessionId)
}
