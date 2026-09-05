/** 归档面板分页纯逻辑（spec 09）：树按折叠态 pre-order 可见行计数，供「加载更多」决策。 */

/** 可见行计数：父行必计，子行仅在父未折叠时计入（与渲染遍历同构）。 */
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
