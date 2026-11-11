/**
 * Minimal structural faces of optional client services (attached through optional forks,
 * so the panel boots on hosts that do not expose them).
 */

/** Official layout service face: switch between a global panel and the conversation. */
export interface LayoutLike {
  selectPanel(id: string | null): void
}

/** Official right-sidebar service face: open one page-kind tab. */
export interface SidebarRightLike {
  openTab(kind: string, options?: { readonly params?: unknown }): void
}

/** Official sessions service face (create a review session without a current one). */
export interface SessionsLike {
  create(options?: { readonly cwd?: string }): Promise<string>
}

/** Official workspace navigation face: open one Session in the main column. */
export interface SessionNavigationLike {
  openSession(sessionId: string): void
}
