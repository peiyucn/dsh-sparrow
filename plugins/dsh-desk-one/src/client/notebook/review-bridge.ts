/**
 * Review bridge: creates a review session in the reviewed file's workspace, reveals it, and
 * opens the review tab.
 *
 * Evidence from the host storage showed the session was created in the right workspace but the
 * main column stayed on the home screen: a freshly created session is not in the client catalog
 * yet, so revealing it must wait for the catalog to refresh. The bridge therefore refreshes the
 * session list, activates the workspace through the official `openWorkspace`, and then reveals
 * the exact session with retries.
 */

import type { ReviewApi } from './review-api.js'
import type {
  ConversationLike, LayoutLike, SessionNavigationLike, SessionScopeLike, SessionsLike, SidebarRightLike,
  WorkspacesLike,
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

/** Result of one start attempt: the notebook shows `message` when the session could not open. */
export interface ReviewStartResult {
  readonly ok: boolean
  readonly message?: string
}

/** Open face the notebook shares with the review tab. */
export interface ReviewBridge {
  /**
   * Continue the file's most recent review, or create a review session and reveal it.
   * @param input - workspace root and file path.
   * @returns whether the review session was opened, plus a readable failure step.
   */
  start(input: ReviewStartInput): Promise<ReviewStartResult>
  /** Reveal one review session again (manual recovery from the home screen). */
  reveal(sessionId: string): Promise<void>
  /** Put one pending batch into the session composer (never sends). */
  sendQuote(sessionId: string, text: string): boolean
  attachLayout(service: LayoutLike): () => void
  attachSidebar(service: SidebarRightLike): () => void
  attachSessions(service: SessionsLike): () => void
  attachNavigation(service: SessionNavigationLike): () => void
  attachWorkspaces(service: WorkspacesLike): () => void
}

/** Attempts to reach the conversation surface after leaving the panel. */
const OPEN_RETRIES = 8
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 80
/** Attempts to reveal a just-created session. */
const REVEAL_RETRIES = 10
/** Reveal retry delay (ms). */
const REVEAL_RETRY_MS = 120

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
export function createReviewBridge(api: ReviewApi): ReviewBridge {
  let layout: LayoutLike | undefined
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined
  let navigation: SessionNavigationLike | undefined
  let workspaces: WorkspacesLike | undefined

  /** Open the tab, retrying while the conversation surface mounts. */
  const openTab = async (reviewId: string): Promise<boolean> => {
    const sidebar = sidebarRight
    if (sidebar === undefined) return false
    for (let attempt = 0; attempt < OPEN_RETRIES; attempt += 1) {
      try {
        sidebar.openTab(REVIEW_TAB_KIND, { params: { reviewId } satisfies NoteReviewParams })
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

  /**
   * Keep revealing a just-opened review session for a few seconds: another navigation can
   * settle after ours and drop the main column back to the home screen.
   * @param sessionId - review session to keep visible.
   */
  const keepRevealed = (sessionId: string): void => {
    for (const ms of [600, 1_500, 3_000]) {
      setTimeout(() => { navigation?.openSession(sessionId) }, ms)
    }
  }

  /** Reveal one session, waiting for the client catalog to list it first. */
  const revealSession = async (sessionId: string): Promise<void> => {
    const nav = navigation
    if (nav === undefined) return
    try { await sessions?.refresh() } catch { /* list may already be fresh */ }
    for (let attempt = 0; attempt < REVEAL_RETRIES; attempt += 1) {
      const listed = sessions?.list.getSnapshot().byId[sessionId]
      if (listed !== undefined) {
        nav.openSession(sessionId)
        return
      }
      await delay(REVEAL_RETRY_MS)
    }
    // Last resort: reveal anyway; the surface may accept it even when the cached list lags.
    nav.openSession(sessionId)
  }

  return {
    async start(input) {
      const nav = navigation
      if (nav === undefined) return { ok: false, message: '对话导航服务不可用（无法打开会话）' }
      if (workspaces === undefined) return { ok: false, message: '工作区服务不可用（无法定位文件所属工作区）' }
      let step = '定位工作区'
      try {
        const workspaceId = await workspaceFor(input.cwd)
        step = '检查历史审阅'
        const existing = await api.list({ cwd: input.cwd, path: input.path })
        const latest = existing[0]
        if (latest !== undefined) {
          try {
            step = '读取历史审阅的目标文件'
            await api.page(latest.id)
            step = '激活审阅会话'
            await nav.openWorkspace(workspaceId)
            await revealSession(latest.sessionId)
            await openTab(latest.id)
            return { ok: true }
          } catch (cause) {
            step = `历史审阅不可用（${reasonOf(cause)}）；改为新建审阅`
          }
        }
        step = '创建审阅会话'
        const sessionId = await nav.connectWorkspace(workspaceId)
        step = '写入审阅记录'
        const review = await api.create({ sessionId, cwd: input.cwd, path: input.path })
        invalidateReviewBadges()
        step = '激活工作区会话'
        await nav.openWorkspace(workspaceId)
        step = '显示审阅会话'
        await revealSession(sessionId)
        keepRevealed(sessionId)
        step = '打开审阅视图'
        await openTab(review.id)
        return { ok: true }
      } catch (cause) {
        return { ok: false, message: `${step}失败：${reasonOf(cause)}` }
      }
    },
    async reveal(sessionId) { await revealSession(sessionId) },
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
