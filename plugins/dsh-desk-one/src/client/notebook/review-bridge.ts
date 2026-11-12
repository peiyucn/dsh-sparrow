/**
 * Review bridge: starts or continues a review session, opens the review tab, hands the
 * pending annotations to the composer, and guards the tab's close when work is unsaved.
 *
 * A review session must be a real workspace session: the main column then shows a DSH
 * session bound to the reviewed file's workspace instead of the empty home screen. The
 * bridge therefore goes through the official workspace navigation (`connectWorkspace`
 * returns the session id, `openSession` reveals it) and reports a readable reason when
 * that fails, so the notebook can show it instead of silently doing nothing.
 */

import type { ReviewApi } from './review-api.js'
import type {
  ConversationLike, LayoutLike, SessionNavigationLike, SessionsLike, SidebarRightLike, TabRecordLike,
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
   * Continue the file's most recent review, or start a new one in its workspace.
   * @param input - workspace root and file path.
   * @returns whether a review session was opened, plus a readable failure reason.
   */
  start(input: ReviewStartInput): Promise<ReviewStartResult>
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
  attachWorkspaces(service: WorkspacesLike): () => void
}

/** How many frames to wait for the conversation surface after leaving the panel. */
const OPEN_RETRIES = 6
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 60

/** Normalize a filesystem path for prefix comparison (Windows case-insensitive, slashes unified). */
function normalizedPath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
}

/** Readable message from an unknown rejection. */
function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Create the bridge; all services start detached. */
export function createReviewBridge(api: ReviewApi): ReviewBridge {
  let layout: LayoutLike | undefined
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined
  let navigation: SessionNavigationLike | undefined
  let workspaces: WorkspacesLike | undefined
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

  /**
   * Reveal one session; the catalog can lag a just-created session by a moment, so the
   * reveal is retried briefly instead of leaving the home screen behind.
   * @param sessionId - session to select.
   */
  const revealSession = (sessionId: string): void => {
    const nav = navigation
    if (nav === undefined) return
    let attempts = 0
    const attempt = (): void => {
      attempts += 1
      nav.openSession(sessionId)
      if (attempts < 4) setTimeout(attempt, 150 * attempts)
    }
    setTimeout(attempt, 0)
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
      if (nav === undefined) return { ok: false, message: '对话导航服务不可用（无法打开会话）' }
      if (workspaces === undefined) return { ok: false, message: '工作区服务不可用（无法定位文件所属工作区）' }
      let step = '定位工作区'
      try {
        const workspaceId = await workspaceFor(input.cwd)
        layout?.selectPanel(null)
        step = '检查历史审阅'
        const existing = await api.list({ cwd: input.cwd, path: input.path })
        const latest = existing[0]
        if (latest !== undefined) {
          try {
            step = '检查历史审阅会话'
            const listed = sessions?.list.getSnapshot().byId[latest.sessionId]
            if (listed === undefined) throw new Error('该审阅会话已不存在或不可用')
            step = '读取历史审阅的目标文件'
            await api.page(latest.id)
            step = '打开历史审阅会话'
            revealSession(latest.sessionId)
            openTab(latest.id)
            return { ok: true }
          } catch (cause) {
            // A moved/renamed target or a vanished session must not reopen a dead tab.
            step = `历史审阅不可用（${reasonOf(cause)}）；将新建审阅`
          }
        }
        step = '创建审阅会话'
        const sessionId = await nav.connectWorkspace(workspaceId)
        step = '写入审阅记录'
        const review = await api.create({ sessionId, cwd: input.cwd, path: input.path })
        invalidateReviewBadges()
        step = '打开审阅会话'
        revealSession(sessionId)
        openTab(review.id)
        return { ok: true }
      } catch (cause) {
        return { ok: false, message: `${step}失败：${reasonOf(cause)}` }
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
    attachWorkspaces(service) {
      workspaces = service
      return () => { if (workspaces === service) workspaces = undefined }
    },
  }
}
