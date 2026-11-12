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

/** Official sessions service face (reach one session's composer). */
export interface SessionsLike {
  scope(id: string): SessionScopeLike | undefined
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

/** Official workspace navigation face: open one Session, or a workspace with its Session. */
export interface SessionNavigationLike {
  openSession(sessionId: string): void
  /**
   * Connect a workspace and open its blank Session, creating or reusing it.
   * @param workspaceId - target workspace.
   * @param beforeOpen - synchronous preparation for the selected Session (writes the review link).
   */
  openWorkspace(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void>
}
