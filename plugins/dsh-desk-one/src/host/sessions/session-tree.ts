

import { nestTree } from '../../tree.js'

export interface SessionTreeHeader {
  readonly id: string
  readonly createdAt: number
  readonly parentSession?: string
  readonly origin?: 'subagent'
}

export interface SessionTreeNode {
  readonly header: SessionTreeHeader
  readonly children: SessionTreeNode[]
}


export function buildSessionTree(headers: readonly SessionTreeHeader[]): SessionTreeNode[] {
  const nodes = nestTree(headers, {
    idOf: header => header.id,
    parentIdOf: header => (header.origin === 'subagent' ? header.parentSession : undefined),
    sortRoots: (left, right) => right.createdAt - left.createdAt,
    sortChildren: (left, right) => left.createdAt - right.createdAt,
  })
  const convert = (node: (typeof nodes)[number]): SessionTreeNode => ({
    header: node.value,
    children: node.children.map(convert),
  })
  return nodes.map(convert)
}

interface ArchiveAlignment {
  readonly add: string[]
  readonly remove: string[]
}


export function archiveAlignmentForChildren(
  headers: readonly SessionTreeHeader[],
  archivedIds: readonly string[],
): ArchiveAlignment {
  const byId = new Map(headers.map(header => [header.id, header]))
  const childrenOf = new Map<string, string[]>()
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (!byId.has(header.parentSession)) continue
    const list = childrenOf.get(header.parentSession) ?? []
    list.push(header.id)
    childrenOf.set(header.parentSession, list)
  }
  const archived = new Set(archivedIds)
  const add: string[] = []
  const remove: string[] = []
  const queue: string[] = []
  const seen = new Set<string>()
  for (const header of headers) {
    const hasParent = header.origin === 'subagent' && header.parentSession !== undefined && byId.has(header.parentSession)
    if (hasParent || seen.has(header.id)) continue
    seen.add(header.id)
    queue.push(header.id)
  }
  for (let i = 0; i < queue.length; i++) {
    const ancestorArchived = archived.has(queue[i])
    for (const childId of childrenOf.get(queue[i]) ?? []) {
      if (seen.has(childId)) continue
      seen.add(childId)
      if (ancestorArchived !== archived.has(childId)) {
        if (ancestorArchived) {
          archived.add(childId)
          add.push(childId)
        } else {
          archived.delete(childId)
          remove.push(childId)
        }
      }
      queue.push(childId)
    }
  }
  return { add, remove }
}


export function livingChildIds(headers: readonly SessionTreeHeader[]): Set<string> {
  const byId = new Set(headers.map(header => header.id))
  const out = new Set<string>()
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (byId.has(header.parentSession)) out.add(header.id)
  }
  return out
}


export function collectSubtreeIds(headers: readonly SessionTreeHeader[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>()
  const byId = new Set(headers.map(header => header.id))
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (!byId.has(header.parentSession)) continue
    const list = childrenOf.get(header.parentSession) ?? []
    list.push(header.id)
    childrenOf.set(header.parentSession, list)
  }
  const out: string[] = [rootId]


  const seen = new Set(out)
  for (let i = 0; i < out.length; i++) {
    for (const child of childrenOf.get(out[i]) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      out.push(child)
    }
  }
  return out
}


export function subagentDescendantIds(headers: readonly SessionTreeHeader[], rootId: string): string[] {
  return collectSubtreeIds(headers, rootId).slice(1)
}


export function archivedIdsToRemove(rootId: string, subagentIds: readonly string[]): string[] {
  const out: string[] = [rootId]
  const seen = new Set(out)
  for (const id of subagentIds) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
