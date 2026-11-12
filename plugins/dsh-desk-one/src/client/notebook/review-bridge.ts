/**
 * Review bridge: starts a review through DSH's own "new session" action and opens the review tab.
 *
 * The previous attempts created a session through the session controller and then tried to reveal
 * it; a freshly created session is not in the client catalog yet, so the main column kept the home
 * screen. The supported path is the workspace navigation: `startSession(workspaceId)` is exactly
 * what the New Session button runs, so the conversation surface, selection and panel switch are
 * all handled by the host UI. The review tab then binds itself to the session it is opened in and
 * writes the review link for that session.
 */

import type { ConversationLike, SessionNavigationLike, SessionScopeLike, SessionsLike, SidebarRightLike, WorkspacesLike } from './faces.js'

/** Stable implementation id (the slot registration key and the tab definition id). */
export const REVIEW_TAB_ID = 'dsh-desk-one-note-review'
/** Page kind opened by `sidebarRight.openTab`. */
export const REVIEW_TAB_KIND = 'note-review'

/** Navigation parameters of the review tab. */
export interface NoteReviewParams {
  /** Existing review record, when the tab is reopened from history. */
  readonly reviewId?: string
  /** Workspace root of the reviewed file (a fresh open; the tab creates the review record). */
  readonly cwd?: string
  /** File path relative to `cwd` (a fresh open). */
  readonly path?: string
}

/** What the notebook hands the bridge when the user reviews a file. */
export interface ReviewStartInput {
  /** Workspace root the relative path is based on. */
  readonly cwd: string
  /** File path relative to `cwd`. */
  readonly path: string
}

/** Result of one start attempt: the notebook shows `message` when the tab could not open. */
export interface ReviewStartResult {
  readonly ok: boolean
  readonly message?: string
}

/** Open face the notebook shares with the review tab. */
export interface ReviewBridge {
  /**
   * Start a review: open a session in the file's workspace, then the review tab for the file.
   * @param input - workspace root and file path.
   * @returns whether the review tab opened, plus a readable failure reason.
   */
  start(input: ReviewStartInput): Promise<ReviewStartResult>
  /** Put one pending batch into the session composer (never sends). */
  sendQuote(sessionId: string, text: string): boolean
  attachSidebar(service: SidebarRightLike): () => void
  attachSessions(service: SessionsLike): () => void
  attachNavigation(service: SessionNavigationLike): () => void
  attachWorkspaces(service: WorkspacesLike): () => void
}

/** Attempts to reach the conversation surface after the new session is requested. */
const OPEN_RETRIES = 15
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 100

/** Normalize a filesystem path for prefix comparison (Windows case-insensitive, slashes unified). */
function normalizedPath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
}

/** Readable message from an unknown rejection. */
function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Sleep one retry slice. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Create the bridge; all services start detached. */
export function createReviewBridge(): ReviewBridge {
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined
  let navigation: SessionNavigationLike | undefined
  let workspaces: WorkspacesLike | undefined

  /** Open the tab, retrying while the conversation surface mounts. */
  const openTab = async (params: NoteReviewParams): Promise<boolean> => {
    const sidebar = sidebarRight
    if (sidebar === undefined) return false
    for (let attempt = 0; attempt < OPEN_RETRIES; attempt += 1) {
      try {
        sidebar.openTab(REVIEW_TAB_KIND, { params })
        return true
      } catch {
        await delay(OPEN_RETRY_MS)
      }
    }
    return false
  }

  /** The official workspace containing `cwd`, creating one through the official flow when absent. */
  const workspaceFor = async (cwd: string): Promise<string> => {
    const service = workspaces
    if (service === undefined) throw new Error('工作区服务不可用')
    const target = normalizedPath(cwd)
    const match = service.list.getSnapshot().items.find((item) => {
      const root = normalizedPath(item.path)
      return target === root || target.startsWith(`${root}/`)
    })
    if (match !== undefined) return match.workspaceId
    const created = await service.create({ path: cwd })
    return created.workspaceId
  }

  return {
    async start(input) {
      const nav = navigation
      if (nav === undefined) return { ok: false, message: '对话导航服务不可用（无法新建会话）' }
      if (workspaces === undefined) return { ok: false, message: '工作区服务不可用（无法定位文件所属工作区）' }
      try {
        // The same call the New Session button makes: the official flow creates/reuses the blank
        // session, selects it and leaves the Desk One panel.
        const workspaceId = await workspaceFor(input.cwd)
        nav.startSession(workspaceId)
        // The tab links the review to whatever session ended up on screen.
        const opened = await openTab({ cwd: input.cwd, path: input.path })
        return opened
          ? { ok: true }
          : { ok: false, message: '会话面板还没就绪，请再点一次「审阅」' }
      } catch (cause) {
        return { ok: false, message: `发起审阅失败：${reasonOf(cause)}` }
      }
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
    attachWorkspaces(service) {
      workspaces = service
      return () => { if (workspaces === service) workspaces = undefined }
    },
  }
}
