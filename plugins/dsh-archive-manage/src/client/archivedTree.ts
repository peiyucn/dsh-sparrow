/**
 * 归档树本地变更纯逻辑（spec 08）：host 写路由成功后，面板按响应里的 id 立即本地摘行，
 * 不等整页刷新落定。零依赖纯模块（照 paging.ts 先例），便于 node:test 直接导入。
 */

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
 * 从归档树按给定 id 集合摘除节点：**只移除命中 id 的节点**（集合由 host 的 trash/delete 响应给出，
 * 现为「根 + 全部后代」整棵子树，见 spec 12）——命中节点的未命中后代上提到该节点位置并标 orphan
 * （host 侧对「父已不在持久化」的子会话同样按孤儿根渲染，见 host.ts /list 的 orphan 字段），
 * 不像旧实现那样连带整棵子树一起消失。
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
 * 任意深度都按归档区同款缩进展示（此前只有一层，深度 ≥2 的后代被平铺成同级行）。
 * 健壮性：重复 id 只收一次；父不在清单内、或父子链成环（畸形数据）的条目按顶层挂——**不丢行**，
 * 也不让渲染转不出来。
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
