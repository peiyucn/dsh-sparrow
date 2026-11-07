/**
 * Client-side session-link contract shared by the bridge, hooks and card UI.
 *
 * The plugin never hard-depends on the host's session services: the bridge is attached from an
 * optional `ctx.inject` fork, and degrades to `enabled: false` when any service is absent.
 */

export type SessionAvailability = 'available' | 'loading' | 'archived' | 'unavailable'

/** One linkable session, resolved live from the host client services (never persisted). */
export interface SessionChipInfo {
  readonly id: string
  readonly title: string
  readonly running: boolean
  readonly availability: SessionAvailability
  readonly updatedAt: number
  readonly cwd?: string
  /** Parent session id for subagent/fork lineage; absent for roots. */
  readonly parentId?: string
  readonly subagent: boolean
}

export interface SessionLinkSnapshot {
  /** False when the host does not expose the session/workspace services (feature hidden). */
  readonly enabled: boolean
  readonly sessions: readonly SessionChipInfo[]
}

/** Thin facade injected into the page: snapshot + subscription + navigation. */
export interface SessionLinkApi {
  list: () => SessionLinkSnapshot
  subscribe: (listener: () => void) => () => void
  /** Opens a session in the workspace when it is currently available; otherwise a no-op. */
  open: (sessionId: string) => void
}

/** Build a disabled facade for hosts without the optional client services. */
export function disabledSessionLink(): SessionLinkApi {
  return {
    list: () => ({ enabled: false, sessions: [] }),
    subscribe: () => () => {},
    open: () => {},
  }
}
