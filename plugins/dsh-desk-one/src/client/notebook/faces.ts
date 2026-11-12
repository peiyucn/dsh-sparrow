/**
 * Minimal structural faces of optional client services (attached through optional forks, so the
 * panel boots on hosts that do not expose them).
 */

/** Official layout service face: switch between a global panel and the conversation. */
export interface LayoutLike {
  selectPanel(id: string | null): void
}

/** Official right-sidebar service face. */
export interface SidebarRightLike {
  openTab(kind: string, options?: { readonly params?: unknown }): void
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
