/**
 * Review bridge: opens the notebook review tab inside the conversation on screen.
 *
 * A review is a conversation capability, not a new session: the tab only needs a Session
 * surface, so the bridge leaves the panel and opens the tab; when no session is on screen it
 * reports that instead of silently doing nothing.
 */

import type { ConversationLike, LayoutLike, SessionScopeLike, SessionsLike, SidebarRightLike } from './faces.js'

/** Tab implementation id (registration key and definition id). */
export const REVIEW_TAB_ID = 'dsh-desk-one-note-review'
/** Page kind opened by `sidebarRight.openTab`. */
export const REVIEW_TAB_KIND = 'note-review'

/** Navigation parameters of the review tab. */
export interface NoteReviewParams {
  /** Page path relative to the configured library root. */
  readonly path: string
}

/** Result of one open attempt. */
export interface ReviewOpenResult {
  readonly ok: boolean
  readonly message?: string
}

/** Open face shared with the notebook page. */
export interface ReviewBridge {
  /**
   * Open the review tab for one page in the session on screen.
   * @param path - library-relative page path.
   * @returns whether the tab opened, plus a readable reason.
   */
  open(path: string): Promise<ReviewOpenResult>
  /** Put one submitted batch into the session composer (never sends). */
  sendQuote(sessionId: string, text: string): boolean
  attachLayout(service: LayoutLike): () => void
  attachSidebar(service: SidebarRightLike): () => void
  attachSessions(service: SessionsLike): () => void
}

/** Attempts to find the conversation surface after leaving the panel. */
const OPEN_RETRIES = 12
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 100

/** Sleep one retry slice. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Create the bridge; all services start detached. */
export function createReviewBridge(): ReviewBridge {
  let layout: LayoutLike | undefined
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined

  return {
    async open(path) {
      const sidebar = sidebarRight
      if (sidebar === undefined) return { ok: false, message: '右侧栏服务不可用（无法打开审阅视图）' }
      layout?.selectPanel(null)
      for (let attempt = 0; attempt < OPEN_RETRIES; attempt += 1) {
        try {
          sidebar.openTab(REVIEW_TAB_KIND, { params: { path } satisfies NoteReviewParams })
          return { ok: true }
        } catch {
          await delay(OPEN_RETRY_MS)
        }
      }
      return { ok: false, message: '请先在对话里打开一个会话（或新建会话），再点「审阅」' }
    },
    sendQuote(sessionId, text) {
      const scope = sessions?.scope(sessionId) as SessionScopeLike | undefined
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
