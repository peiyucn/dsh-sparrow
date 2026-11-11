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

/** Official sessions service face (create a review session; reach its composer). */
export interface SessionsLike {
  create(options?: { readonly cwd?: string }): Promise<string>
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

/** Official workspace navigation face: open one Session in the main column. */
export interface SessionNavigationLike {
  openSession(sessionId: string): void
}
