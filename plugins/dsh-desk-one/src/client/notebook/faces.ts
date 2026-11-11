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
