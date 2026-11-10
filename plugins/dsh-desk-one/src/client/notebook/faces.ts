/**
 * Minimal structural faces of optional client services.
 *
 * Each is attached through an optional dependency fork, so the panel boots even
 * on a host that does not expose it; only the few members this plugin calls are
 * declared here instead of importing whole UI packages into the bundle.
 */

/** Official layout service face: switch between a global panel and the conversation. */
export interface LayoutLike {
  selectPanel(id: string | null): void
}

/** Official right-sidebar service face: open one page-kind tab. */
export interface SidebarRightLike {
  openTab(kind: string, options?: { readonly params?: unknown }): void
}

/** Session-scope lookup face. */
export interface SessionScopeLike {
  get(name: string): unknown
}

/** Official sessions service face. */
export interface SessionsLike {
  scope(id: string): SessionScopeLike | undefined
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
