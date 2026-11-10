/**
 * Session management REST contract (neutral layer): request / response DTOs for the 12 method routes.
 *
 * Types only, zero runtime dependencies, shared by the host and client halves (kept at the root rather than
 * under host/, otherwise the client half would import the host directory backwards and invert the layering).
 * The response shape is assembled on the host and consumed on the client; writing one shape twice always
 * drifts (historically it dropped `parentSessionId` / `agentAvailable`).
 */

/** Archive tree node (an element of GET /list's `tree`). */
export interface ArchiveTreeNode {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly createdAt: number
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly workspaceIds: readonly string[]
  /** Orphan child session whose parent no longer exists (treated as top-level; can be archived / deleted manually). */
  readonly orphan: boolean
  readonly children: readonly ArchiveTreeNode[]
  /** Display facts (official projection / snapshot; the matching item is hidden when absent). */
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}

/** Stray session item (an element of GET /strays's `items`). */
export interface StraySessionItem {
  readonly sessionId: string
  readonly title: string
  readonly createdAt: number
  readonly blank: boolean
  readonly orphan: boolean
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}

/** Child session of a trash entry (sidecar v2 bookkeeping, only to show the parent/child hierarchy; restore / delete the whole subtree through the parent entry). */
export interface TrashSubagentItem {
  readonly sessionId: string
  readonly title: string
  readonly parentSessionId?: string
}

/** Restorable trash entry (sidecar v1 / v2). */
export interface TrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  readonly legacy: false
  readonly subagents: readonly TrashSubagentItem[]
}

/** Legacy entry without a sidecar: the directory name is the session id; list / permanently delete only, no restore. */
export interface LegacyTrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  readonly legacy: true
}

export type TrashEntry = TrashItem | LegacyTrashItem

/* ------------------------------ Request bodies ------------------------------ */

export interface UnarchiveRequest {
  readonly sessionId: string
}

export interface ArchiveRequest {
  readonly sessionId: string
}

export interface TrashRequest {
  readonly sessionId: string
  readonly confirm?: boolean
}

/** Normal sessions need `confirmTitle` to match the title verbatim; blank stray sessions use `confirm: true` for a simpler check. */
export interface DeleteRequest {
  readonly sessionId: string
  readonly confirmTitle?: string
  readonly confirm?: boolean
}

export interface TrashDeleteRequest {
  readonly trashId: string
  readonly confirm?: boolean
}

export interface RestoreRequest {
  readonly trashId: string
}

export interface TrashRestoreAllRequest {
  readonly confirm?: boolean
}

export interface TrashDeleteAllRequest {
  readonly confirm?: boolean
}

/* ------------------------------ Response bodies ------------------------------ */

export interface ListResponse {
  readonly tree: readonly ArchiveTreeNode[]
}

export interface StraysResponse {
  readonly items: readonly StraySessionItem[]
}

export interface TrashListResponse {
  readonly items: readonly TrashEntry[]
}

export interface TrashDirResponse {
  readonly path: string
  readonly displayPath: string
}

export interface UnarchiveResponse {
  readonly ok: true
}

export interface ArchiveResponse {
  readonly ok: true
  readonly archivedIds: readonly string[]
}

export interface TrashMutationResponse {
  readonly ok: true
  readonly trashId: string
  readonly workspaceIds: readonly string[]
  readonly subagentIds: readonly string[]
}

export interface DeleteMutationResponse {
  readonly ok: true
  readonly deleted: true
  readonly workspaceIds: readonly string[]
  readonly subagentIds: readonly string[]
}

export interface TrashDeleteResponse {
  readonly ok: true
  readonly trashId: string
}

export interface RestoreResponse {
  readonly ok: true
  readonly sessionId: string
  readonly workspaceIds: readonly string[]
}

export interface TrashRestoreFailure {
  readonly trashId: string
  readonly message: string
}

export interface TrashRestoreAllResponse {
  readonly ok: true
  readonly restored: readonly string[]
  readonly skippedLegacy: number
  readonly failed: readonly TrashRestoreFailure[]
}

export interface TrashDeleteAllResponse {
  readonly ok: true
  readonly deleted: number
  readonly failed: readonly string[]
}
