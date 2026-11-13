/**
 * Minimal structural faces of optional client services (attached through optional forks, so the
 * panel boots on hosts that do not expose them).
 */

/** Read-only snapshot store subset shared by the official list services. */
export interface SnapshotLike<T> {
  getSnapshot(): T
}

/** Official right-sidebar service face. */
export interface SidebarRightLike {
  openTab(kind: string, options?: { readonly params?: unknown }): void
  /**
   * The Session currently drawn by the sidebar. It moves before React paints the switch, so reuse
   * navigation can wait for it and only then open the tab in the arriving Session.
   */
  readonly mounted?: SnapshotLike<string | undefined>
}

/** Official sessions service face (reach one session's composer, inspect the live catalog). */
export interface SessionsLike {
  scope(id: string): SessionScopeLike | undefined
  /** Live Session catalog: a marker's Session must still be listed to be reopened. */
  readonly list?: SnapshotLike<{ readonly ids?: readonly string[] }>
}

/** Official workspaces service face (archived Sessions cannot be reopened). */
export interface WorkspacesLike {
  readonly list?: SnapshotLike<{ readonly archivedSessionIds?: readonly string[] }>
}

/** Session-scope lookup face. */
export interface SessionScopeLike {
  get(name: string): unknown
}

/** Composer input facade (public `SessionInput` subset used here). */
export interface SessionInputLike {
  insertQuote(text: string): boolean
  focus(): void
}

/** Session-scoped conversation service (public `IConversation` subset). */
export interface ConversationLike {
  readonly input: { for(scope: unknown): SessionInputLike }
}

/** Official workspace navigation face. */
export interface SessionNavigationLike {
  /** Start a new session in one workspace — the official New Session action. */
  startSession(workspaceId: string, options?: { readonly prompt?: string }): void
  /**
   * Open a session in a workspace, exposing the created/reused session id synchronously.
   * Official Workspace navigation; optional because older hosts may only expose startSession.
   */
  openWorkspace?(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void>
  /** Select an existing Session (official `uiWorkspace.openSession`). */
  openSession?(sessionId: string): void
}
