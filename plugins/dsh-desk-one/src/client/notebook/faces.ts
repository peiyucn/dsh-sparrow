/**
 * Minimal structural faces of optional client services (attached through optional forks,
 * so the panel boots on hosts that do not expose them).
 */

/** Official layout service face: switch between a global panel and the conversation. */
export interface LayoutLike {
  selectPanel(id: string | null): void
}

/** Official right-sidebar service face used by the review tab. */
export interface SidebarRightLike {
  openTab(kind: string, options?: { readonly params?: unknown }): void
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
  /** Replace the whole draft with plain text (we append to the current one ourselves). */
  setDraft(text: string): void
  /** Input state snapshot (read the current draft before appending). */
  readonly state: { getSnapshot(): { readonly draft: string } }
  focus(): void
}

/** Session-scoped conversation service (public `IConversation` subset). */
export interface ConversationLike {
  readonly input: { for(scope: unknown): SessionInputLike }
}

/** Official workspace navigation face used to open the review session. */
export interface SessionNavigationLike {
  /** Start a new session in one workspace — the official New Session action. */
  startSession(workspaceId: string): void
}
