

import {
  isReviewSession, pickReusableReviewSession, rememberReviewSession, reviewSessionCandidates, reviewSessionsReady,
} from './review/sessions.js'
import type { ReusableSessionFacts } from './review/sessions.js'
import { pruneReviewTabParams } from './review/tab-memory.js'
import type {
  ConversationLike, SessionNavigationLike, SessionScopeLike, SessionsLike, SidebarRightLike, WorkspacesLike,
} from './faces.js'


export const REVIEW_TAB_ID = 'dsh-desk-one-note-review'

export const REVIEW_TAB_KIND = 'note-review'


export interface NoteReviewParams {

  readonly path: string

  readonly fileId: string

  readonly workspaceId: string

  readonly markOnOpen?: boolean
}


export type ReviewOpenMode = 'current' | 'new' | 'reuse'


export interface ReviewOpenOptions {

  readonly mode?: ReviewOpenMode

  readonly sessionId?: string
}


export type ReviewOpenInput = NoteReviewParams


export interface ReviewOpenResult {
  readonly ok: boolean
  readonly message?: string
}


export interface ReviewBridge {

  open(input: ReviewOpenInput, options?: ReviewOpenOptions): Promise<ReviewOpenResult>

  openFilesBrowser(workspaceId: string): Promise<ReviewOpenResult>

  sendQuote(sessionId: string, text: string): boolean
  attachSidebar(service: SidebarRightLike): () => void
  attachSessions(service: SessionsLike): () => void
  attachWorkspaces(service: WorkspacesLike): () => void
  attachNavigation(service: SessionNavigationLike): () => void
}


const OPEN_RETRIES = 20

const OPEN_RETRY_MS = 100

const MOUNT_RETRIES = 40

const MOUNT_RETRY_MS = 50

const TURNS_TIMEOUT_MS = 1_500

const TURNS_WARM_CONCURRENCY = 4


function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}


export async function warmSessionTurns(
  sessionIds: readonly string[],
  refresh: (sessionId: string) => Promise<void>,
  options: { readonly concurrency?: number; readonly timeoutMs?: number } = {},
): Promise<void> {
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? TURNS_WARM_CONCURRENCY), sessionIds.length))
  const timeoutMs = options.timeoutMs ?? TURNS_TIMEOUT_MS
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < sessionIds.length) {
      const sessionId = sessionIds[next] as string
      next += 1
      try {
        await Promise.race([refresh(sessionId), delay(timeoutMs)])
      } catch {

      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}


async function waitForMounted(sidebar: SidebarRightLike, sessionId: string): Promise<boolean> {
  const mounted = sidebar.mounted
  if (mounted === undefined) return false
  for (let attempt = 0; attempt < MOUNT_RETRIES; attempt += 1) {
    if (mounted.getSnapshot() === sessionId) return true
    await delay(MOUNT_RETRY_MS)
  }
  return false
}


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


export function createReviewBridge(): ReviewBridge {
  let sidebarRight: SidebarRightLike | undefined
  let sessions: SessionsLike | undefined
  let workspaces: WorkspacesLike | undefined
  let navigation: SessionNavigationLike | undefined


  const inspect = (sessionId: string): ReusableSessionFacts => {
    const list = sessions?.list?.getSnapshot()
    const turns = list?.projectionsBySession?.[sessionId]?.values?.sessionStats?.turns
    const archived = workspaces?.list?.getSnapshot().archivedSessionIds
    return {
      openable: list?.ids?.includes(sessionId) === true && archived?.includes(sessionId) !== true,
      ...turns === undefined ? {} : { turns },
    }
  }


  const warmTurns = async (sessionIds: readonly string[]): Promise<void> => {
    const refresh = sessions?.refreshProjections
    if (refresh === undefined || sessionIds.length === 0) return
    await warmSessionTurns(sessionIds, sessionId => refresh.call(sessions, sessionId))
  }


  const pruneStaleTabMemos = (currentSessionId: string | undefined): void => {
    const ids = sessions?.list?.getSnapshot().ids
    if (ids === undefined || ids.length === 0) return
    pruneReviewTabParams(sessionId => sessionId === currentSessionId
      || isReviewSession(sessionId)
      || ids.includes(sessionId))
  }


  const reusableSession = async (input: NoteReviewParams): Promise<string | undefined> => {
    await reviewSessionsReady()
    const candidates = reviewSessionCandidates(input.fileId)
    if (candidates.length === 0) return undefined

    await warmTurns(candidates
      .filter(info => info.workspaceId === undefined || info.workspaceId === input.workspaceId)
      .map(info => info.sessionId)
      .filter(sessionId => inspect(sessionId).openable))
    return pickReusableReviewSession(candidates, input.workspaceId, inspect)
  }

  return {
    async open(input, options) {
      const sidebar = sidebarRight
      if (sidebar === undefined) return { ok: false, message: '右侧栏服务不可用（无法打开审阅视图）' }
      const params: NoteReviewParams = { path: input.path, fileId: input.fileId, workspaceId: input.workspaceId }
      const mode = options?.mode ?? 'reuse'
      if (mode === 'current') {
        if (!await openReviewTab(sidebar, params)) {
          return { ok: false, message: '当前会话的右侧栏没有就绪，请再点一次「审阅」' }
        }
        pruneStaleTabMemos(options?.sessionId)
        return { ok: true }
      }

      const nav = navigation
      if (nav === undefined) return { ok: false, message: '对话导航服务不可用（无法新建审阅会话）' }

      if (mode !== 'new' && nav.openSession !== undefined) {
        try {
          const reusable = await reusableSession(input)
          if (reusable !== undefined) {
            nav.openSession(reusable)
            if (sidebar.mounted === undefined) {


              if (await openReviewTab(sidebar, params)) {
                rememberReviewSession(reusable)
                pruneStaleTabMemos(reusable)
                return { ok: true }
              }
              return { ok: false, message: '审阅会话已打开，但右侧栏没有就绪，请再点一次「审阅」' }
            }
            if (await waitForMounted(sidebar, reusable) && await openReviewTab(sidebar, params)) {
              rememberReviewSession(reusable)
              pruneStaleTabMemos(reusable)
              return { ok: true }
            }


            return { ok: false, message: '原审阅会话正在加载，请稍后再点一次「审阅」（不会新建会话）' }
          }
        } catch {

        }
      }

      let createdSessionId: string | undefined
      const createdParams: NoteReviewParams = { ...params, markOnOpen: true }
      try {


        if (nav.openWorkspace !== undefined) {
          await nav.openWorkspace(input.workspaceId, (sessionId) => {
            createdSessionId = sessionId
            rememberReviewSession(sessionId)
          })
        } else {
          nav.startSession(input.workspaceId)
        }
      } catch (cause) {
        return { ok: false, message: `新建审阅会话失败：${cause instanceof Error ? cause.message : String(cause)}` }
      }
      if (!await openReviewTab(sidebar, createdParams)) {
        return { ok: false, message: '审阅会话已创建，但右侧栏没有就绪，请再点一次「审阅」' }
      }
      pruneStaleTabMemos(createdSessionId)
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
