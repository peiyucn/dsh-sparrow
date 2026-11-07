/**
 * Session-link bridge: reads the host's public client services (`sessions`, `workspaces`,
 * `uiWorkspace`) through an optional dependency fork and exposes one stable facade to the page.
 *
 * The services are typed structurally on purpose: they live in other official packages and the
 * plugin only relies on the small, documented snapshot/navigation surface used by ui-schedule.
 */

import type { SessionChipInfo, SessionLinkApi, SessionLinkSnapshot } from './contract.js'

interface SessionProjectionValuesLike {
  /** Official `subagent` projection view value (summary key); label identifies the child. */
  readonly subagent?: { readonly label?: string } | null
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
      title: chipTitle(row, id),
      running: row?.running === true,
      availability,
      updatedAt: row?.updatedAt ?? 0,
      ...row?.cwd === undefined ? {} : { cwd: row.cwd },
      ...row?.parentId === undefined ? {} : { parentId: row.parentId },
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
  }

  return { api, attach }
}
