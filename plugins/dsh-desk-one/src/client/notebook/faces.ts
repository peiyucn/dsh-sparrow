/**
 * Minimal structural faces of optional client services (attached through optional forks,
 * so the panel boots on hosts that do not expose them).
 */

/** Official layout service face: switch between a global panel and the conversation. */
export interface LayoutLike {
  selectPanel(id: string | null): void
}

/** One tab record as the close handler sees it. */
export interface TabRecordLike {
  readonly id: string
}

/** Official right-sidebar service face used by the review tab. */
export interface SidebarRightLike {
  openTab(kind: string, options?: { readonly params?: unknown }): void
  close(tabId: string): void
  registerCloseHandler(kind: string, handler: (sessionId: string, tab: TabRecordLike) => void): () => void
}

/** One projected workspace (the official workspace-controller view). */
export interface WorkspaceViewLike {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
}

/** Official workspace-controller service face (resolve the reviewed file's workspace). */
export interface WorkspacesLike {
  readonly list: { getSnapshot(): { readonly items: readonly WorkspaceViewLike[] } }
  create(input: { readonly path: string }): Promise<WorkspaceViewLike>
}

/** One listed session, as far as the review bridge cares. */
export interface SessionSummaryLike {
  readonly cwd?: string
}

/** Official sessions service face (reach one session's composer; check a listed session). */
export interface SessionsLike {
  scope(id: string): SessionScopeLike | undefined
  readonly list: { getSnapshot(): { readonly byId: Readonly<Record<string, SessionSummaryLike>> } }
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

/** Official workspace navigation face used to open the review session. */
export interface SessionNavigationLike {
  /** Reveal one existing Session in the main column. */
  openSession(sessionId: string): void
  /**
   * Connect a workspace and resolve its blank Session (created or reused).
   * @param workspaceId - target workspace.
   * @returns the session id, bound to that workspace.
   */
  connectWorkspace(workspaceId: string): Promise<string>
}
