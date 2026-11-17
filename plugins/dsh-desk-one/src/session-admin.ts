


export interface ArchiveTreeNode {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly createdAt: number
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly workspaceIds: readonly string[]

  readonly orphan: boolean
  readonly children: readonly ArchiveTreeNode[]

  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}


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


interface TrashSubagentItem {
  readonly sessionId: string
  readonly title: string
  readonly parentSessionId?: string
}


export interface TrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  readonly legacy: false
  readonly subagents: readonly TrashSubagentItem[]
}


export interface LegacyTrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  readonly legacy: true
}

export type TrashEntry = TrashItem | LegacyTrashItem



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

interface TrashRestoreFailure {
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
