/**
 * Session-link bridge: reads the host's public client services (`sessions`, `workspaces`,
 * `uiWorkspace`) through an optional dependency fork and exposes one stable facade to the page.
 *
 * The services are typed structurally on purpose: they live in other official packages and the
 * plugin only relies on the small, documented snapshot/navigation surface used by ui-schedule.
 */

import type { SessionChipInfo, SessionLinkApi, SessionLinkSnapshot } from './contract.js'

interface SessionRowLike {
  readonly id: string
  readonly displayTitle?: string
  readonly title?: string
  readonly running?: boolean
  readonly updatedAt?: number
  readonly cwd?: string
  readonly origin?: string
}

interface SessionListStateLike {
  readonly ids?: readonly string[]
  readonly byId?: Readonly<Record<string, SessionRowLike>>
  readonly phase?: string
}

interface SessionsServiceLike {
  readonly list: {
    getSnapshot: () => SessionListStateLike
    subscribe: (listener: () => void) => () => void
  }
}

interface WorkspaceStateLike {
  readonly phase?: string
  readonly state?: string
  readonly archivedSessionIds?: readonly string[]
}

interface WorkspacesServiceLike {
  readonly list: { getSnapshot: () => WorkspaceStateLike }
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

function resolveSnapshot(services: SessionServices | null): SessionLinkSnapshot {
  if (services === null) return { enabled: false, sessions: [] }
  const list = services.sessions.list.getSnapshot()
  const workspaces = services.workspaces.list.getSnapshot()
  const archived = new Set(workspaces.archivedSessionIds ?? [])
  const loading = list.phase === 'pending' || workspaces.phase === 'pending'
  const sessions: SessionChipInfo[] = (list.ids ?? []).map((id) => {
    const row = list.byId?.[id]
    const availability = loading
      ? 'loading'
      : archived.has(id) ? 'archived' : row === undefined ? 'unavailable' : 'available'
    return {
      id,
      title: row?.displayTitle ?? row?.title ?? id,
      running: row?.running === true,
      availability,
      updatedAt: row?.updatedAt ?? 0,
      ...row?.cwd === undefined ? {} : { cwd: row.cwd },
      subagent: row?.origin === 'subagent',
    }
  })
  // Running sessions first, then most recently updated — the picker's default order.
  sessions.sort((left, right) =>
    Number(right.running) - Number(left.running)
    || right.updatedAt - left.updatedAt
    || left.title.localeCompare(right.title))
  return { enabled: true, sessions }
}

export function createSessionLinkBridge(): SessionLinkBridge {
  let services: SessionServices | null = null
  const listeners = new Set<() => void>()
  const emit = (): void => { for (const listener of listeners) listener() }

  const attach = (next: SessionServices): (() => void) => {
    services = next
    const unsubscribers = [
      next.sessions.list.subscribe(emit),
    ]
    emit()
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
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
  }

  return { api, attach }
}
