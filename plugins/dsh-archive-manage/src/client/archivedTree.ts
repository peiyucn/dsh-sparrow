/** 归档树本地变更与展示判定纯逻辑（spec 08 / 15）：零依赖，便于 `node:test` 直接导入。 */

/** 归档树节点：顶层为归档会话根，children 为随父归档的子会话（host /list 契约）。 */
export interface ArchivedSessionItem {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly createdAt: number
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly workspaceIds: readonly string[]
  /** 父会话已不存在的孤儿子会话（按顶层对待，可手动归档/删除）。 */
  readonly orphan: boolean
  readonly children: readonly ArchivedSessionItem[]
  /** 展示用事实（官方投影/快照；缺失时隐藏对应项）。 */
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}

/** 归档树某节点的子树 id（本地已知的父子关系；取消归档时按它即时摘除整棵子树）。 */
export function subtreeIdsOf(item: ArchivedSessionItem): string[] {
  return [item.sessionId, ...item.children.flatMap(subtreeIdsOf)]
}

/**
 * 按给定 id 集合从归档树摘除节点：**只移除命中 id 的节点**，命中节点的未命中后代上提到该位置并
 * 标 orphan（与 host 侧对「父已不在持久化」的子会话按孤儿根渲染对齐），不连带整棵子树消失。
 */
export function dropArchivedIds(items: readonly ArchivedSessionItem[], ids: ReadonlySet<string>): ArchivedSessionItem[] {
  const kept: ArchivedSessionItem[] = []
  for (const item of items) {
    const children = dropArchivedIds(item.children, ids)
    if (!ids.has(item.sessionId)) {
      kept.push({ ...item, children })
      continue
    }
    for (const child of children) kept.push(child.orphan ? child : { ...child, orphan: true })
  }
  return kept
}

/** 子树内是否存在未释放（本次 dsh 运行中驻留）的会话：父级操作因它整单锁定（spec 08），任意深度。 */
export function subtreeLive(item: ArchivedSessionItem): boolean {
  return item.live || item.children.some(subtreeLive)
}

/** 锁定是否来自**后代**（自身 live 已在行内提示，不再重复）：spec 15 的「子会话未释放」判据。 */
export function descendantLive(item: ArchivedSessionItem): boolean {
  return item.children.some(subtreeLive)
}

/** 默认收起（spec 15）：只有被显式展开过的节点才展开；判据收在这里，免得折叠态散落成各处取反。 */
export function isCollapsed(expandedIds: ReadonlySet<string>, sessionId: string): boolean {
  return !expandedIds.has(sessionId)
}

/** 回收站条目的子会话条目（host /trash 视图形状）。 */
export interface TrashSubagentItem {
  readonly sessionId: string
  readonly title: string
  /** 父会话 id；旧 sidecar 无此字段（或父不在本条目内）→ 该条按顶层展示。 */
  readonly parentSessionId?: string
}

export interface TrashSubagentNode {
  readonly item: TrashSubagentItem
  readonly children: readonly TrashSubagentNode[]
}

/**
 * 回收站条目的**扁平**子会话清单 → 嵌套树（spec 14）：层级由 sidecar 记的 `parentSessionId` 还原，
 * 任意深度都按归档区同款缩进展示。健壮性：重复 id 只收一次；父不在清单内、或父子链成环（畸形数据）
 * 的条目按顶层挂 —— **不丢行**，也不让渲染转不出来。
 */
export function trashSubagentTree(items: readonly TrashSubagentItem[]): TrashSubagentNode[] {
  const byId = new Map<string, TrashSubagentItem>()
  const ordered: TrashSubagentItem[] = []
  for (const item of items) {
    if (byId.has(item.sessionId)) continue
    byId.set(item.sessionId, item)
    ordered.push(item)
  }
  /** 沿 parentSessionId 上溯；父不在清单内即为顶，遇环返回 false（该条按顶层挂）。 */
  const reachesTop = (item: TrashSubagentItem): boolean => {
    const seen = new Set([item.sessionId])
    let parent = item.parentSessionId
    while (parent !== undefined && byId.has(parent)) {
      if (seen.has(parent)) return false
      seen.add(parent)
      parent = byId.get(parent)?.parentSessionId
    }
    return true
  }
  const childrenOf = new Map<string, TrashSubagentItem[]>()
  const roots: TrashSubagentItem[] = []
  for (const item of ordered) {
    const parent = item.parentSessionId
    if (parent !== undefined && parent !== item.sessionId && byId.has(parent) && reachesTop(item)) {
      const list = childrenOf.get(parent) ?? []
      list.push(item)
      childrenOf.set(parent, list)
      continue
    }
    roots.push(item)
  }
  const build = (item: TrashSubagentItem): TrashSubagentNode => ({
    item,
    children: (childrenOf.get(item.sessionId) ?? []).map(build),
  })
  return roots.map(build)
}
