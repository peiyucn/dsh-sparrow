/** 归档面板的分页窗口纯逻辑：树按折叠态 pre-order 计数可见行，供「加载更多」决策。 */

import type { TrashEntry, TrashSubagentItem } from '../contract.js'

/** 回收站条目的子会话（旧格式条目没有 sidecar，按空处理）。 */
export function trashSubagentsOf(item: TrashEntry): readonly TrashSubagentItem[] {
  return item.legacy ? [] : item.subagents
}

/** 可见行计数：父行必计，子行仅在父未折叠时计入（与渲染遍历同构，任意深度递归）。 */
export function countVisibleRows<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  isCollapsed: (node: T) => boolean,
): number {
  let count = 0
  const walk = (items: readonly T[]): void => {
    for (const item of items) {
      count += 1
      const children = childrenOf(item)
      if (children.length > 0 && !isCollapsed(item)) walk(children)
    }
  }
  walk(roots)
  return count
}

/**
 * 回收站区可见行预算：父条目恒计入，子会话仅在父条目展开时计入。
 *
 * 计数口径 = 父条目 + sidecar 的**全部** subagent 条目：sidecar v2 记的是随父搬走的
 * 整棵后代（扁平清单，任意深度），而 `trashSubagentTree` 把每个唯一条目渲染且只渲染一行，
 * 故「父 + 全部条目」等于渲染行数。
 */
export function trashVisibleRows(items: readonly TrashEntry[], isCollapsed: (item: TrashEntry) => boolean): number {
  return items.reduce((total, item) => {
    const children = trashSubagentsOf(item).length
    return total + 1 + (isCollapsed(item) ? 0 : children)
  }, 0)
}
