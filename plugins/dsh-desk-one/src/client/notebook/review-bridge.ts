/**
 * Review bridge: starts or continues a review session, opens the review tab, hands the
 * pending annotations to the composer, and guards the tab's close when work is unsaved.
 *
 * A review is a DSH session of its own: creating one never depends on a current Session
 * being open, and continuing one reuses the most recent review of the file.
 */

import type { DeskReview } from '../../contract.js'
import type { ReviewApi } from './review-api.js'
import type {
  ConversationLike, LayoutLike, SessionNavigationLike, SessionsLike, SidebarRightLike, TabRecordLike,
} from './faces.js'
import { invalidateReviewBadges } from './review-badges.js'

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
  /** Put one pending batch into the session composer (never sends). */
  sendQuote(sessionId: string, text: string): boolean
  /** Report how many unsaved annotations one tab holds (0 clears the guard). */
  setPending(tabId: string, count: number): void
  /** Subscribe to "a close was blocked because of unsaved work". */
  onCloseBlocked(listener: (tabId: string) => void): () => void
  /** Close one tab, bypassing the unsaved-work guard once. */
  forceClose(tabId: string): void
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
  /** Unsaved annotation count per tab id. */
  const pending = new Map<string, number>()
  /** Tabs whose next close must skip the guard. */
  const bypass = new Set<string>()
  const closeBlocked = new Set<(tabId: string) => void>()

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
          invalidateReviewBadges()
        }
        // Opening a review tab needs the conversation surface on screen.
        layout?.selectPanel(null)
        navigation.openSession(review.sessionId)
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
    sendQuote(sessionId, text) {
      const scope = sessions?.scope(sessionId)
      const conversation = scope?.get('conversation') as ConversationLike | undefined
      if (scope === undefined || conversation === undefined) return false
      const input = conversation.input.for(scope)
      const accepted = input.insertQuote(text)
      if (accepted) input.focus()
      return accepted
    },
    setPending(tabId, count) {
      if (count <= 0) pending.delete(tabId)
      else pending.set(tabId, count)
    },
    onCloseBlocked(listener) {
      closeBlocked.add(listener)
      return () => { closeBlocked.delete(listener) }
    },
    forceClose(tabId) {
      bypass.add(tabId)
      sidebarRight?.close(tabId)
    },
    attachLayout(service) {
      layout = service
      return () => { if (layout === service) layout = undefined }
    },
    attachSidebar(service) {
      sidebarRight = service
      const dispose = service.registerCloseHandler(REVIEW_TAB_KIND, (_sessionId: string, tab: TabRecordLike) => {
        if (bypass.delete(tab.id)) return
        if ((pending.get(tab.id) ?? 0) === 0) return
        // Throwing preserves the tab; the body then asks the user to confirm.
        for (const listener of closeBlocked) listener(tab.id)
        throw new Error('review: unsaved annotations')
      })
      return () => {
        dispose()
        if (sidebarRight === service) sidebarRight = undefined
      }
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
