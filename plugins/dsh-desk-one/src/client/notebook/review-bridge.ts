/**
 * Review bridge: opens one note's review in a Session.
 *
 * A review must not borrow the conversation the user is currently in, so this never reuses an
 * unrelated Session. It does, however, reopen the note's OWN previous review Session when that
 * Session is still around: the durable review-session markers carry the note `fileId`, so clicking
 * the same note again continues the existing conversation instead of piling up a new Session per
 * click. A fresh Session is started only for a first review, or when the marker points at a
 * deleted / archived / other-workspace Session.
 */

import {
  pickReusableReviewSession, rememberReviewSession, reviewSessionCandidates, reviewSessionsReady,
} from '../reviewSessions.js'
import type { ReusableSessionFacts } from '../reviewSessions.js'
import type {
  ConversationLike, SessionNavigationLike, SessionScopeLike, SessionsLike, SidebarRightLike, WorkspacesLike,
} from './faces.js'

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
   * Open a review for one note: reopen the note's existing review Session when it is still
   * openable in the same workspace, otherwise start a new one. Then open the review tab there.
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
  attachWorkspaces(service: WorkspacesLike): () => void
  attachNavigation(service: SessionNavigationLike): () => void
}

/** Attempts to reach the conversation surface after starting the session. */
const OPEN_RETRIES = 20
/** Delay between attempts (ms). */
const OPEN_RETRY_MS = 100
/** Attempts to see the sidebar mount a reused Session before opening its tab. */
const MOUNT_RETRIES = 40
/** Delay between mount checks (ms). */
const MOUNT_RETRY_MS = 50
/** How long warming one candidate's turn count may take before the pick falls back to newest. */
const TURNS_TIMEOUT_MS = 1_500

/** Sleep one retry slice. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Wait until the right sidebar reports one Session on screen. */
async function waitForMounted(sidebar: SidebarRightLike, sessionId: string): Promise<boolean> {
  const mounted = sidebar.mounted
  if (mounted === undefined) return false
  for (let attempt = 0; attempt < MOUNT_RETRIES; attempt += 1) {
    if (mounted.getSnapshot() === sessionId) return true
    await delay(MOUNT_RETRY_MS)
  }
  return false
}

/** Open the review tab, retrying while the sidebar surface settles for the Session. */
async function openReviewTab(sidebar: SidebarRightLike, params: NoteReviewParams): Promise<boolean> {
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

/** Create the bridge; all services start detached. */
export function createReviewBridge(): ReviewBridge {
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined
  let workspaces: WorkspacesLike | undefined
  let navigation: SessionNavigationLike | undefined

  /** Live catalog facts: the Session must exist, be unarchived, and report its turns when known. */
  const inspect = (sessionId: string): ReusableSessionFacts => {
    const list = sessions?.list?.getSnapshot()
    const turns = list?.projectionsBySession?.[sessionId]?.values?.sessionStats?.turns
    const archived = workspaces?.list?.getSnapshot().archivedSessionIds
    return {
      openable: list?.ids?.includes(sessionId) === true && archived?.includes(sessionId) !== true,
      ...turns === undefined ? {} : { turns },
    }
  }

  /** Load turn counts for the openable candidates, bounded so a slow host cannot block opening. */
  const warmTurns = async (sessionIds: readonly string[]): Promise<void> => {
    if (sessions?.refreshProjections === undefined || sessionIds.length === 0) return
    const refresh = sessions.refreshProjections.bind(sessions)
    await Promise.all(sessionIds.map(async (sessionId) => {
      try {
        await Promise.race([refresh(sessionId), delay(TURNS_TIMEOUT_MS)])
      } catch {
        // Turn counts are progressive enhancement: the newest candidate still reopens.
      }
    }))
  }

  /** The note's own review Session, when one is still openable in this workspace. */
  const reusableSession = async (input: NoteReviewParams): Promise<string | undefined> => {
    await reviewSessionsReady()
    const candidates = reviewSessionCandidates(input.fileId)
    if (candidates.length === 0) return undefined
    // Warm the counts so a newer 0-turn duplicate cannot shadow the note's real conversation.
    await warmTurns(candidates
      .filter(info => info.workspaceId === undefined || info.workspaceId === input.workspaceId)
      .map(info => info.sessionId)
      .filter(sessionId => inspect(sessionId).openable))
    return pickReusableReviewSession(candidates, input.workspaceId, inspect)
  }

  return {
    async open(input) {
      const nav = navigation
      const sidebar = sidebarRight
      if (nav === undefined) return { ok: false, message: '对话导航服务不可用（无法新建审阅会话）' }
      if (sidebar === undefined) return { ok: false, message: '右侧栏服务不可用（无法打开审阅视图）' }
      const params: NoteReviewParams = { path: input.path, fileId: input.fileId, workspaceId: input.workspaceId }
      // 1) Continue this note's existing review conversation when it is still openable.
      if (nav.openSession !== undefined) {
        try {
          const reusable = await reusableSession(input)
          if (reusable !== undefined) {
            nav.openSession(reusable)
            if (await waitForMounted(sidebar, reusable) && await openReviewTab(sidebar, params)) {
              rememberReviewSession(reusable)
              return { ok: true }
            }
          }
        } catch {
          // Navigation refused (e.g. the Host stopped listing it) — fall through to a fresh Session.
        }
      }
      // 2) First review of this note, or the previous review Session is gone.
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
      if (!await openReviewTab(sidebar, params)) {
        return { ok: false, message: '审阅会话已创建，但右侧栏没有就绪，请再点一次「审阅」' }
      }
      return { ok: true }
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
    attachWorkspaces(service) {
      workspaces = service
      return () => { if (workspaces === service) workspaces = undefined }
    },
    attachNavigation(service) {
      navigation = service
      return () => { if (navigation === service) navigation = undefined }
    },
  }
}
