/**
 * Review bridge: starts a dedicated review session in the notebook's workspace and opens the
 * review tab there.
 *
 * A review must not borrow the conversation the user is currently in (that would silently mix
 * review context into an unrelated session), so the entry goes through the official New Session
 * action for the library's workspace and the tab binds to that fresh session.
 */

import { rememberReviewSession } from '../reviewSessions.js'
import type { ConversationLike, SessionNavigationLike, SessionScopeLike, SessionsLike, SidebarRightLike } from './faces.js'

/** Tab implementation id (registration key and definition id). */
export const REVIEW_TAB_ID = 'dsh-desk-one-note-review'
/** Page kind opened by `sidebarRight.openTab`. */
export const REVIEW_TAB_KIND = 'note-review'

/** Navigation parameters of the review tab. */
export interface NoteReviewParams {
  /** Page path relative to the configured library root. */
  readonly path: string
  /** File identity the review is attached to. */
  readonly fileId: string
  /** Workspace that owns the library root. */
  readonly workspaceId: string
}

/** What the notebook hands the bridge when the user starts a review. */
export type ReviewOpenInput = NoteReviewParams

/** Result of one open attempt. */
export interface ReviewOpenResult {
  readonly ok: boolean
  readonly message?: string
}

/** Open face shared with the notebook page. */
export interface ReviewBridge {
  /**
   * Start a review in a new session of the library workspace, then open the review tab.
   * @param input - page path, file identity, and the workspace to open the session in.
   * @returns whether the tab opened, plus a readable reason.
   */
  open(input: ReviewOpenInput): Promise<ReviewOpenResult>
  /** Start a new session in one workspace with a prefilled composer draft (never sends). */
  draftInNewSession(workspaceId: string, prompt: string): void
  /**
   * Start a session in the library workspace and open the official file browser there.
   * The official right sidebar only exists on session pages, so this explicitly enters one.
   * @param workspaceId - workspace that owns the library root.
   * @returns whether the official files tab opened, plus a readable reason.
   */
  openFilesBrowser(workspaceId: string): Promise<ReviewOpenResult>
  /** Put one submitted batch into the session composer (never sends). */
  sendQuote(sessionId: string, text: string): boolean
  attachSidebar(service: SidebarRightLike): () => void
  attachSessions(service: SessionsLike): () => void
  attachNavigation(service: SessionNavigationLike): () => void
}

/** Attempts to reach the conversation surface after starting the session. */
const OPEN_RETRIES = 20
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 100

/** Sleep one retry slice. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Create the bridge; all services start detached. */
export function createReviewBridge(): ReviewBridge {
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined
  let navigation: SessionNavigationLike | undefined

  return {
    async open(input) {
      const nav = navigation
      const sidebar = sidebarRight
      if (nav === undefined) return { ok: false, message: '对话导航服务不可用（无法新建审阅会话）' }
      if (sidebar === undefined) return { ok: false, message: '右侧栏服务不可用（无法打开审阅视图）' }
      try {
        // Same flow as the New Session button; openWorkspace also tells us the session id so the
        // conversation-area review hint can be scoped to this session only.
        if (nav.openWorkspace !== undefined) {
          await nav.openWorkspace(input.workspaceId, sessionId => { rememberReviewSession(sessionId) })
        } else {
          nav.startSession(input.workspaceId)
        }
      } catch (cause) {
        return { ok: false, message: `新建审阅会话失败：${cause instanceof Error ? cause.message : String(cause)}` }
      }
      const params: NoteReviewParams = { path: input.path, fileId: input.fileId, workspaceId: input.workspaceId }
      for (let attempt = 0; attempt < OPEN_RETRIES; attempt += 1) {
        try {
          sidebar.openTab(REVIEW_TAB_KIND, { params })
          return { ok: true }
        } catch {
          await delay(OPEN_RETRY_MS)
        }
      }
      return { ok: false, message: '审阅会话已创建，但右侧栏没有就绪，请再点一次「审阅」' }
    },
    async openFilesBrowser(workspaceId) {
      const nav = navigation
      const sidebar = sidebarRight
      if (nav === undefined) return { ok: false, message: '对话导航服务不可用（无法新建会话）' }
      if (sidebar === undefined) return { ok: false, message: '右侧栏服务不可用（无法打开文件浏览）' }
      try {
        nav.startSession(workspaceId)
      } catch (cause) {
        return { ok: false, message: `新建会话失败：${cause instanceof Error ? cause.message : String(cause)}` }
      }
      for (let attempt = 0; attempt < OPEN_RETRIES; attempt += 1) {
        try {
          sidebar.openTab('files')
          return { ok: true }
        } catch {
          await delay(OPEN_RETRY_MS)
        }
      }
      return { ok: false, message: '会话已创建，但右侧栏没有就绪，请再点一次「打开文件浏览」' }
    },
    draftInNewSession(workspaceId, prompt) {
      navigation?.startSession(workspaceId, { prompt })
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
