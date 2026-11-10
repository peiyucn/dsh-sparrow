/**
 * Session lineage math: building the parent/child tree, aligning archived state with the parent,
 * collecting subtrees, and deciding which ids leave the archive set on trash/delete.
 */

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

/**
 * Build the parent/child tree from the full set of session headers:
 * - Child sessions (origin === 'subagent' and parent present in the list) hang under their parent, siblings sorted by createdAt ascending;
 * - Top-level sessions and orphan child sessions (parent absent from the list) are roots, sorted by createdAt descending;
 * - Orphans are treated as top-level sessions (no parent to follow; the panel handles them manually).
 */
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

/**
 * Compute the parent/child archive alignment diff (state invariant: children mirror their parent):
 * - Parent archived but child not → added to `add`;
 * - Parent not archived but child archived → added to `remove`;
 * - Orphan child sessions (parent absent from the list) and top-level sessions are not involved.
 *
 * A subagent can itself spawn further subagents, so "children mirror their parent" must travel down the
 * parent/child chain to **all descendants**: BFS from every top-level node propagates the ancestor's archive
 * state down level by level (each node is visited once when ids are unique, O(n)). The old implementation that
 * looked at only one level per pass aligned a single level on multi-level trees and relied on its own write
 * triggering another `domain/changed` round to converge — betting correctness on the event chain — and the
 * panel's lazy alignment could only advance one level per open. With no root node (parent/child cycle) nobody
 * can propagate, so no alignment is done at all.
 *
 * The `seen` guard (same one added to `collectSubtreeIds` in the same batch): when ids are unique a cycle is
 * necessarily unreachable; but in malformed data two headers sharing one id can create a cycle that is
 * **reachable from a root** (one of them sits at the tail of the chain and points back to an ancestor), and
 * without the guard this function would spin forever inside the host's `domain/changed` listener and the
 * `/list` route (2026-09-12 audit S1).
 */
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

/** Set of child session ids that have a parent (parent present in the list) — they follow their parent and never show up alone in the stray area. */
export function livingChildIds(headers: readonly SessionTreeHeader[]): Set<string> {
  const byId = new Set(headers.map(header => header.id))
  const out = new Set<string>()
  for (const header of headers) {
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    if (byId.has(header.parentSession)) out.add(header.id)
  }
  return out
}

/** Root session id plus all its descendant ids (any depth, BFS order preserved, root first; used when archiving / trashing / deleting a parent as a unit). */
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
  // seen guard: the parent/child chain comes from on-disk headers and is acyclic in theory; should a cycle
  // appear (manual disk edits / abnormal upstream writes), BFS must still terminate — callers do file-level moves / deletes, and hanging is worse than moving less.
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

/**
 * subagent session ids to move / delete together with the root session: **all descendants** of the root
 * (any depth, BFS with parents before children, root excluded). A subagent can spawn further subagents, so
 * the depth is not fixed at one level — taking only direct children would miss deeper descendants.
 */
export function subagentDescendantIds(headers: readonly SessionTreeHeader[], rootId: string): string[] {
  return collectSubtreeIds(headers, rootId).slice(1)
}

/**
 * Ids to remove from the archived set after trashing / permanently deleting: the root plus the **child
 * sessions actually moved/deleted** (deduplicated, root first). Callers pass the **full descendant set**
 * returned by `listSubagentTargets` (any depth) — trash/delete moves/deletes the entire subtree one by one,
 * so the whole subtree must leave the archived set; removing only direct children would leave descendants at
 * depth ≥2 as permanent orphan roots (their parent is no longer persisted and parent/child alignment cannot
 * see them either; verified 2026-09-12).
 */
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

/**
 * Header-facts cache store (pure logic, unit-testable): returns the cache directly within the TTL; once
 * expired it fills single-flight (concurrent calls share one promise); invalidate clears the cache so the
 * next get rescans. Safety basis: jsonl headers are immutable once materialized, so caching by id only needs
 * to handle members appearing/disappearing (write-through invalidation).
 *
 * Invalidation generation: invalidate voids an in-flight load — a scan started before the invalidation may
 * not write its result back to the cache, otherwise write-through invalidation would be cancelled out by
 * "the old member table refilling the cache" (stale for the whole TTL); a voided promise still settles
 * normally for whoever was waiting on it (snapshot semantics), it just isn't cached.
 */
