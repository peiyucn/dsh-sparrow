/**
 * host ↔ client 的 REST 契约：12 条方法路由的请求 / 响应 DTO。
 *
 * 只放类型，零运行时依赖，host 与 client 两半共用 —— 响应形状在 host 组装、在 client 消费，
 * 同一形状写两遍必然漂移（历史上就漏过 `parentSessionId` / `agentAvailable`）。
 */

/** 归档树节点（GET /list 的 `tree` 元素）。 */
export interface ArchiveTreeNode {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly createdAt: number
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly workspaceIds: readonly string[]
  /** 父会话已不存在的孤儿子会话（按顶层对待，可手动归档 / 删除）。 */
  readonly orphan: boolean
  readonly children: readonly ArchiveTreeNode[]
  /** 展示用事实（官方投影 / 快照；缺失时隐藏对应项）。 */
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}

/** 游离会话条目（GET /strays 的 `items` 元素）。 */
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

/** 回收站条目的子会话（sidecar v2 记账，仅供展示父子层级；还原 / 删除整棵走父条目）。 */
export interface TrashSubagentItem {
  readonly sessionId: string
  readonly title: string
  readonly parentSessionId?: string
}

/** 可还原的回收站条目（sidecar v1 / v2）。 */
export interface TrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  readonly legacy: false
  readonly subagents: readonly TrashSubagentItem[]
}

/** 无 sidecar 的旧格式条目：目录名即会话 id，只可列出 / 彻底删除，不可还原。 */
export interface LegacyTrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  readonly legacy: true
}

export type TrashEntry = TrashItem | LegacyTrashItem

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string }
}

/* ------------------------------ 请求体 ------------------------------ */

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

/** 普通会话要 `confirmTitle` 逐字匹配标题；空白游离会话用 `confirm: true` 简化确认。 */
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

/* ------------------------------ 响应体 ------------------------------ */

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
