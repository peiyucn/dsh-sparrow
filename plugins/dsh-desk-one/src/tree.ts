

interface TreeNode<T> {
  readonly value: T
  readonly children: readonly TreeNode<T>[]
}

interface NestOptions<T> {
  readonly idOf: (item: T) => string

  readonly parentIdOf: (item: T) => string | undefined
  readonly sortRoots?: (left: T, right: T) => number
  readonly sortChildren?: (left: T, right: T) => number
}


export function nestTree<T>(items: readonly T[], options: NestOptions<T>): TreeNode<T>[] {
  const byId = new Map<string, T>()
  for (const item of items) byId.set(options.idOf(item), item)
  const parentOf = new Map<string, string>()
  for (const item of items) {
    const parentId = options.parentIdOf(item)
    if (parentId !== undefined && parentId !== options.idOf(item) && byId.has(parentId)) {
      parentOf.set(options.idOf(item), parentId)
    }
  }
  const childrenOf = new Map<string, T[]>()
  const roots: T[] = []
  for (const item of items) {
    const parentId = parentOf.get(options.idOf(item))
    if (parentId === undefined) roots.push(item)
    else {
      const siblings = childrenOf.get(parentId) ?? []
      siblings.push(item)
      childrenOf.set(parentId, siblings)
    }
  }

  for (const item of items) {
    let cursor = options.idOf(item)
    const seen = new Set<string>()
    while (parentOf.has(cursor)) {
      if (seen.has(cursor)) {
        const parentId = parentOf.get(cursor)
        if (parentId !== undefined) {
          const siblings = childrenOf.get(parentId)
          const index = siblings?.findIndex(candidate => options.idOf(candidate) === cursor) ?? -1
          if (siblings !== undefined && index >= 0) {
            const [promoted] = siblings.splice(index, 1)
            if (promoted !== undefined) {
              parentOf.delete(cursor)
              roots.push(promoted)
            }
          }
        }
        break
      }
      seen.add(cursor)
      const parentId = parentOf.get(cursor)
      if (parentId === undefined) break
      cursor = parentId
    }
  }
  const build = (item: T): TreeNode<T> => {
    const children = [...(childrenOf.get(options.idOf(item)) ?? [])]
    if (options.sortChildren !== undefined) children.sort(options.sortChildren)
    return { value: item, children: children.map(build) }
  }
  const sortedRoots = [...roots]
  if (options.sortRoots !== undefined) sortedRoots.sort(options.sortRoots)
  return sortedRoots.map(build)
}
