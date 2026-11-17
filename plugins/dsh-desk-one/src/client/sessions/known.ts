

import type { ArchiveTreeNode, TrashEntry } from '../../session-admin.js'


export interface KnownSessions {
  readonly archived: ReadonlySet<string>
  readonly trashed: ReadonlySet<string>
}


export function knownSessionIds(
  tree: readonly ArchiveTreeNode[],
  trash: readonly TrashEntry[],
): KnownSessions {
  const archived = new Set<string>()
  const addNode = (node: ArchiveTreeNode): void => {
    archived.add(node.sessionId)
    for (const child of node.children) addNode(child)
  }
  for (const node of tree) addNode(node)
  const trashed = new Set<string>()
  for (const entry of trash) {
    trashed.add(entry.sessionId)
    if (!entry.legacy) {
      for (const subagent of entry.subagents) trashed.add(subagent.sessionId)
    }
  }
  return { archived, trashed }
}


export function excludeKnownSessions<T extends { readonly id: string }>(
  sessions: readonly T[],
  known: KnownSessions,
): readonly T[] {
  if (known.archived.size === 0 && known.trashed.size === 0) return sessions
  return sessions.filter(session => !known.archived.has(session.id) && !known.trashed.has(session.id))
}


export function pruneKnownHidden(
  hidden: Set<string>,
  known: KnownSessions,
): Set<string> {
  let next: Set<string> | null = null
  for (const id of hidden) {
    if (!known.archived.has(id) && !known.trashed.has(id)) continue
    next ??= new Set(hidden)
    next.delete(id)
  }
  return next ?? hidden
}
