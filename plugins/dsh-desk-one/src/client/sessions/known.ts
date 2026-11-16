/**
 * Session ids already accounted for by the archive management panes (archived tree + trash).
 *
 * The official session list keeps a moved session's row until its own reload. Once a session is
 * moved from the archive into the trash it also leaves the official archived set, so without this
 * set the active catalog would render it as an active session until a full page refresh.
 */

import type { ArchiveTreeNode, TrashEntry } from '../../session-admin.js'

/** Every id the archive sections display. */
export interface KnownSessions {
  readonly archived: ReadonlySet<string>
  readonly trashed: ReadonlySet<string>
}

/**
 * Collect every session id shown by the archive sections: archived subtrees (roots + descendants)
 * and trash entries (entries + their subagent rows).
 * @param tree - archived tree as returned by the host.
 * @param trash - trash entries as returned by the host.
 * @returns the two id sets.
 */
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

/**
 * Drop sessions that an archive section already renders, so the active catalog cannot resurrect a
 * session the official list has not removed yet.
 * @param sessions - active catalog candidates.
 * @param known - ids shown by the archive sections.
 * @returns the filtered sessions (same array when nothing is known yet).
 */
export function excludeKnownSessions<T extends { readonly id: string }>(
  sessions: readonly T[],
  known: KnownSessions,
): readonly T[] {
  if (known.archived.size === 0 && known.trashed.size === 0) return sessions
  return sessions.filter(session => !known.archived.has(session.id) && !known.trashed.has(session.id))
}

/**
 * Drop the optimistic hide for ids an archive pane now shows.
 *
 * Hiding the row right after archiving keeps it from lingering while the archive pane scans disk.
 * Once the pane lists the id, the pane itself is the authority: the active catalog filters it via
 * {@link excludeKnownSessions}, and the hide can go. Clearing it here (rather than only suppressing
 * it at render time) is what makes a later unarchive / restore show the row immediately instead of
 * leaving it invisible until a full page refresh.
 * @param hidden - ids hidden after an active-row archive.
 * @param known - ids currently shown by the archive sections.
 * @returns the hidden set without ids the archive pane owns, or the same set when nothing changed.
 */
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
