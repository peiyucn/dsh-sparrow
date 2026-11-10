/**
 * Review bridge: opens the note-review tab and hands annotation text to the composer.
 *
 * Both ends are optional services; a host without them simply cannot open the
 * review (the shelf stays read-only) instead of failing the panel.
 */

import type { ConversationLike, LayoutLike, SessionsLike, SidebarRightLike } from './faces.js'

/** Stable implementation id (the slot registration key and the tab definition id). */
export const REVIEW_TAB_ID = 'dsh-desk-one-note-review'
/** Page kind opened by `sidebarRight.openTab`. */
export const REVIEW_TAB_KIND = 'note-review'

/** Navigation parameters of the review tab. */
export interface NoteReviewParams {
  /** Page path relative to the notes root. */
  readonly path: string
}

/** Open + hand-off face the shelf and the tab body share. */
export interface ReviewBridge {
  /**
   * Reveal one page in the right sidebar.
   * @param path - page path relative to the notes root.
   * @returns whether the tab was asked to open.
   */
  open(path: string): boolean
  /**
   * Put one annotation into the session composer (never sends).
   * @param sessionId - the session whose composer receives the quote.
   * @param text - quote text.
   * @returns whether the composer accepted it.
   */
  sendToAi(sessionId: string, text: string): boolean
  attachLayout(service: LayoutLike): () => void
  attachSidebar(service: SidebarRightLike): () => void
  attachSessions(service: SessionsLike): () => void
}

/** How many frames to wait for the conversation surface after leaving the panel. */
const OPEN_RETRIES = 6
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 60

/** Create the bridge; all services start detached. */
export function createReviewBridge(): ReviewBridge {
  let layout: LayoutLike | undefined
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined

  return {
    open(path) {
      const sidebar = sidebarRight
      if (sidebar === undefined) return false
      // The tab needs an on-screen Session surface, which only exists in the conversation
      // view: leave the global panel first, then open once the surface is mounted.
      layout?.selectPanel(null)
      let attempts = 0
      const attempt = (): void => {
        attempts += 1
        try {
          sidebar.openTab(REVIEW_TAB_KIND, { params: { path } satisfies NoteReviewParams })
          return
        } catch {
          if (attempts < OPEN_RETRIES) setTimeout(attempt, OPEN_RETRY_MS)
        }
      }
      setTimeout(attempt, 0)
      return true
    },
    sendToAi(sessionId, text) {
      const scope = sessions?.scope(sessionId)
      const conversation = scope?.get('conversation') as ConversationLike | undefined
      if (scope === undefined || conversation === undefined) return false
      const input = conversation.input.for(scope)
      const accepted = input.insertQuote(text)
      if (accepted) input.focus()
      return accepted
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
  }
}
