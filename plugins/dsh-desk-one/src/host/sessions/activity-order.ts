/**
 * Session-management ordering: every section shows the most recently active conversation first.
 *
 * Archived rows carry `lastActiveAt` from the official projection; cold rows without a fact fall
 * back to `createdAt`. Trash has no session-activity fact, so its own list keeps the archivedAt
 * order (handled by the trash repository).
 */

/** Fields the ordering helpers need; every session-management DTO satisfies them. */
export interface ActivityDated {
  readonly createdAt: number
  readonly lastActiveAt?: number
  readonly updatedAt?: number
}

/** Most recent known activity: last prompt, then any updated stamp, then creation. */
export function activityTimeOf(item: ActivityDated): number {
  return item.lastActiveAt ?? item.updatedAt ?? item.createdAt
}

/** Descending by {@link activityTimeOf}; equal times keep the caller's order. */
export function byRecentActivity(left: ActivityDated, right: ActivityDated): number {
  return activityTimeOf(right) - activityTimeOf(left)
}

/** Sort a flat section (strays) without mutating the input. */
export function sortByRecentActivity<T extends ActivityDated>(items: readonly T[]): T[] {
  return [...items].sort(byRecentActivity)
}

/** Sort roots and each parent's children by recent activity without mutating the input tree. */
export function sortTreeByRecentActivity<T extends ActivityDated & { readonly children: readonly T[] }>(
  nodes: readonly T[],
): T[] {
  return [...nodes]
    .sort(byRecentActivity)
    .map(node => ({ ...node, children: sortTreeByRecentActivity(node.children) } as T))
}
