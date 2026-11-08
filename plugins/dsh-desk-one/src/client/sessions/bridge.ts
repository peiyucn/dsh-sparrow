/**
 * Session-link bridge: reads the host's public client services (`sessions`, `workspaces`,
 * `uiWorkspace`) through an optional dependency fork and exposes one stable facade to the page.
 *
 * The services are typed structurally on purpose: they live in other official packages and the
 * plugin only relies on the small, documented snapshot/navigation surface used by ui-schedule.
 */

import type { SessionChipInfo, SessionLinkApi, SessionLinkSnapshot } from './contract.js'

interface TokenUsageLike {
  readonly uncachedInputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

interface SessionProjectionValuesLike {
  /** Official `subagent` projection view value (summary key); label identifies the child. */
  readonly subagent?: { readonly label?: string } | null
  /** Provider-reported usage; a summary projection already present on list rows. */
  readonly tokenUsage?: TokenUsageLike | null
  /** Full-projection stats read on demand (excluded from list summaries). */
  readonly sessionStats?: {
    readonly turns?: number
    readonly steps?: number
    readonly llmMs?: number
  } | null
}

interface SessionRowLike {
  readonly id: string
  readonly displayTitle?: string
  readonly title?: string
  readonly running?: boolean
  readonly updatedAt?: number
  readonly cwd?: string
  readonly origin?: string
  readonly parentId?: string
  readonly projectionValues?: SessionProjectionValuesLike
}

interface SessionListStateLike {
  readonly ids?: readonly string[]
  readonly byId?: Readonly<Record<string, SessionRowLike>>
  readonly phase?: string
  readonly projectionsBySession?: Readonly<Record<string, {
    readonly values?: SessionProjectionValuesLike
  }>>
}

interface SessionsServiceLike {
  readonly list: {
    getSnapshot: () => SessionListStateLike
    subscribe: (listener: () => void) => () => void
  }
  /** Official public read: load full projections without opening a Session. */
  readonly refreshProjections?: (sessionId: string) => Promise<void>
}

interface WorkspaceRowLike {
  readonly workspaceId?: string
  readonly title?: string
  readonly path?: string
  readonly sessionIds?: readonly string[]
}

interface WorkspaceStateLike {
  readonly phase?: string
  readonly state?: string
  readonly archivedSessionIds?: readonly string[]
  readonly items?: readonly WorkspaceRowLike[]
}

interface WorkspacesServiceLike {
  readonly list: {
    getSnapshot: () => WorkspaceStateLike
    /** Optional for older hosts: archive changes must wake the picker when available. */
    subscribe?: (listener: () => void) => () => void
  }
}

interface UiWorkspaceLike {
  openSession: (sessionId: string) => void
}

/** Structural view of the client context used by the optional fork. */
export interface SessionServices {
  readonly sessions: SessionsServiceLike
  readonly workspaces: WorkspacesServiceLike
  readonly uiWorkspace: UiWorkspaceLike
}

export interface SessionLinkBridge {
  readonly api: SessionLinkApi
  /** Attach to live services; returns a detach that restores the disabled facade. */
  attach: (services: SessionServices) => () => void
}

/**
 * Display label for one client session row, aligned with the composer's `@` labels:
 * - subagent sessions use the `subagent` label first (composer shows `displayTitle`, whose
 *   subagent branch is the label); the durable title is only a fallback;
 * - ordinary sessions use the durable title, never the cwd-basename `displayTitle`.
 */
function chipTitle(row: SessionRowLike | undefined, id: string): string {
  if (row === undefined) return id
  if (row.origin === 'subagent') {
    const label = row.projectionValues?.subagent?.label
    if (label !== undefined && label !== '') return label
    if (row.title !== undefined && row.title !== '') return row.title
    if (row.displayTitle !== undefined && row.displayTitle !== '') return row.displayTitle
    return id
  }
  return row.title !== undefined && row.title !== '' ? row.title : id
}

function resolveSnapshot(services: SessionServices | null): SessionLinkSnapshot {
  if (services === null) return { enabled: false, sessions: [], workspaces: [] }
  const list = services.sessions.list.getSnapshot()
  const workspaces = services.workspaces.list.getSnapshot()
  const archived = new Set(workspaces.archivedSessionIds ?? [])
  const loading = list.phase === 'pending' || workspaces.phase === 'pending'
  const sessions: SessionChipInfo[] = (list.ids ?? []).map((id) => {
    const row = list.byId?.[id]
    const values = list.projectionsBySession?.[id]?.values
    const stats = values?.sessionStats
    const tokens = values?.tokenUsage
    const availability = loading
      ? 'loading'
      : archived.has(id) ? 'archived' : row === undefined ? 'unavailable' : 'available'
    return {
      id,
      title: chipTitle(row, id),
      running: row?.running === true,
      availability,
      updatedAt: row?.updatedAt ?? 0,
      ...row?.cwd === undefined ? {} : { cwd: row.cwd },
      ...row?.parentId === undefined ? {} : { parentId: row.parentId },
      subagent: row?.origin === 'subagent',
      ...typeof stats?.turns === 'number' ? { turns: stats.turns } : {},
      ...typeof stats?.steps === 'number' ? { steps: stats.steps } : {},
      ...typeof stats?.llmMs === 'number' ? { llmMs: stats.llmMs } : {},
      ...typeof tokens?.uncachedInputTokens === 'number' ? { inputTokens: tokens.uncachedInputTokens } : {},
      ...typeof tokens?.outputTokens === 'number' ? { outputTokens: tokens.outputTokens } : {},
      ...typeof tokens?.cacheReadTokens === 'number' ? { cacheReadTokens: tokens.cacheReadTokens } : {},
      ...typeof tokens?.cacheWriteTokens === 'number' ? { cacheWriteTokens: tokens.cacheWriteTokens } : {},
    }
  })
  // Running sessions first, then most recently updated — the picker's default order.
  sessions.sort((left, right) =>
    Number(right.running) - Number(left.running)
    || right.updatedAt - left.updatedAt
    || left.title.localeCompare(right.title))
  const workspaceGroups = (workspaces.items ?? []).map(workspace => ({
    id: String(workspace.workspaceId ?? ''),
    title: workspace.title ?? workspace.path ?? '',
    path: workspace.path ?? '',
    sessionIds: workspace.sessionIds ?? [],
  }))
  return { enabled: true, sessions, workspaces: workspaceGroups }
}

export function createSessionLinkBridge(): SessionLinkBridge {
  let services: SessionServices | null = null
  const listeners = new Set<() => void>()
  const emit = (): void => { for (const listener of listeners) listener() }

  const attach = (next: SessionServices): (() => void) => {
    services = next
    const unsubscribeSessions = next.sessions.list.subscribe(emit)
    // Archive/unarchive changes land on the workspace store, not the session list: without this
    // subscription a restored session would keep the stale status until a full page reload.
    const unsubscribeWorkspaces = next.workspaces.list.subscribe?.(emit)
    emit()
    return () => {
      unsubscribeSessions()
      unsubscribeWorkspaces?.()
      services = null
      emit()
    }
  }

  const api: SessionLinkApi = {
    list: () => resolveSnapshot(services),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    open: (sessionId) => {
      if (services === null) return
      const info = resolveSnapshot(services).sessions.find(session => session.id === sessionId)
      if (info !== undefined && info.availability === 'available') services.uiWorkspace.openSession(sessionId)
    },
    inspect: async (sessionId) => {
      const refresh = services?.sessions.refreshProjections
      if (refresh === undefined) return
      try {
        await refresh.call(services?.sessions, sessionId)
      } catch {
        // Stats are progressive enhancement: the preview still shows list metadata without them.
      }
    },
  }

  return { api, attach }
}
