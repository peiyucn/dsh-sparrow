


export interface ActivityDated {
  readonly createdAt: number
  readonly lastActiveAt?: number
  readonly updatedAt?: number
}


export function activityTimeOf(item: ActivityDated): number {
  return item.lastActiveAt ?? item.updatedAt ?? item.createdAt
}


export function byRecentActivity(left: ActivityDated, right: ActivityDated): number {
  return activityTimeOf(right) - activityTimeOf(left)
}


export function sortByRecentActivity<T extends ActivityDated>(items: readonly T[]): T[] {
  return [...items].sort(byRecentActivity)
}


export function sortTreeByRecentActivity<T extends ActivityDated & { readonly children: readonly T[] }>(
  nodes: readonly T[],
): T[] {
  return [...nodes]
    .sort(byRecentActivity)
    .map(node => ({ ...node, children: sortTreeByRecentActivity(node.children) } as T))
}
