/**
 * Review bridge: starts or continues a review session and opens the review tab.
 *
 * A review is a DSH session of its own: creating one never depends on a current
 * Session being open, and continuing one reuses the most recent review of the file.
 */

import type { DeskReview } from '../../contract.js'
import type { ReviewApi } from './review-api.js'
import type { LayoutLike, SessionNavigationLike, SessionsLike, SidebarRightLike } from './faces.js'

/** Stable implementation id (the slot registration key and the tab definition id). */
export const REVIEW_TAB_ID = 'dsh-desk-one-note-review'
/** Page kind opened by `sidebarRight.openTab`. */
export const REVIEW_TAB_KIND = 'note-review'

/** Navigation parameters of the review tab. */
export interface NoteReviewParams {
  /** The review record the tab shows. */
  readonly reviewId: string
}

/** What the notebook hands the bridge when the user reviews a file. */
export interface ReviewStartInput {
  /** Workspace root the relative path is based on. */
  readonly cwd: string
  /** File path relative to `cwd`. */
  readonly path: string
}

/** Open face the notebook shares with the review tab. */
export interface ReviewBridge {
  /**
   * Continue the file's most recent review, or start a new one.
   * @param input - workspace root and file path.
   * @returns whether a review session was opened.
   */
  start(input: ReviewStartInput): Promise<boolean>
  /**
   * Reveal one review tab.
   * @param reviewId - review record id.
   * @returns whether the tab was asked to open.
   */
  open(reviewId: string): boolean
  attachLayout(service: LayoutLike): () => void
  attachSidebar(service: SidebarRightLike): () => void
  attachSessions(service: SessionsLike): () => void
  attachNavigation(service: SessionNavigationLike): () => void
}

/** How many frames to wait for the conversation surface after leaving the panel. */
const OPEN_RETRIES = 6
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 60

/** Create the bridge; all services start detached. */
export function createReviewBridge(api: ReviewApi): ReviewBridge {
  let layout: LayoutLike | undefined
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined
  let navigation: SessionNavigationLike | undefined

  const openTab = (reviewId: string): boolean => {
    const sidebar = sidebarRight
    if (sidebar === undefined) return false
    let attempts = 0
    const attempt = (): void => {
      attempts += 1
      try {
        sidebar.openTab(REVIEW_TAB_KIND, { params: { reviewId } satisfies NoteReviewParams })
        return
      } catch {
        if (attempts < OPEN_RETRIES) setTimeout(attempt, OPEN_RETRY_MS)
      }
    }
    setTimeout(attempt, 0)
    return true
  }

  return {
    async start(input) {
      if (sessions === undefined || navigation === undefined) return false
      try {
        // Continue the file's latest review when there is one; otherwise start a new session.
        const existing = await api.list({ cwd: input.cwd, path: input.path })
        let review: DeskReview | undefined = existing[0]
        if (review === undefined) {
          const sessionId = await sessions.create({ cwd: input.cwd })
          review = await api.create({ sessionId, cwd: input.cwd, path: input.path })
        }
        // Opening a review tab needs the conversation surface on screen.
        layout?.selectPanel(null)
        navigation.openSession(review.sessionId)
        // Let the selection render before opening the sidebar page.
        setTimeout(() => { openTab(review.id) }, 0)
        return true
      } catch {
        return false
      }
    },
    open(reviewId) {
      layout?.selectPanel(null)
      return openTab(reviewId)
    },
    attachLayout(service) {
      layout = service
      return () => { if (layout === service) layout = undefined }
    },
    attachSidebar(service) {
      sidebarRight = service
      return () => { if (sidebarRight === service) sidebarRight = undefined }
    },
    attachSessions(service) {
      sessions = service
      return () => { if (sessions === service) sessions = undefined }
    },
    attachNavigation(service) {
      navigation = service
      return () => { if (navigation === service) navigation = undefined }
    },
  }
}
