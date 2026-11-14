/**
 * Header facts cache: public `sessionPersistence.list()` snapshot facts (headers, sizes, storage
 * locations) behind a TTL single-flight store, plus the header projection the host tree needs.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionLocation, SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import {
  createHeaderFactsStore, type HeaderFactsStore, type SessionTreeHeader, type SessionTreeNode,
} from './archive.js'
import { HEADER_CACHE_TTL_MS } from './constants.js'

/**
 * Payload type of the header facts cache: full headers, a snapshot size map, and the public
 * per-session storage location (jsonl path). Pending sessions (created but not flushed) carry no
 * location, so they simply stay absent from `locations` and callers fall back to their existing
 * "backend cannot address this session" path.
 */
export type HeaderFacts = {
  headers: SessionHeader[]
  sizes: Map<string, number>
  locations: Map<string, SessionLocation>
}

/** Read the public persistence list once and flatten it into the facts this host tree needs. */
async function storedHeaderFacts(ctx: Context): Promise<HeaderFacts> {
  const snapshots = await ctx.sessionPersistence.list() as readonly SessionPersistenceSnapshot[]
  const headers: SessionHeader[] = []
  const sizes = new Map<string, number>()
  const locations = new Map<string, SessionLocation>()
  for (const snapshot of snapshots) {
    const header = snapshot.header
    headers.push(header)
    const id = String(header.id)
    if (typeof snapshot.sizeBytes === 'number') sizes.set(id, snapshot.sizeBytes)
    if (snapshot.location !== undefined) locations.set(id, snapshot.location)
  }
  return { headers, sizes, locations }
}

/** Header facts cache (single-flight + TTL). Write-through invalidation is handled by startup's event listeners and the write routes. */
export function createHeaderStore(ctx: Context): HeaderFactsStore<HeaderFacts> {
  return createHeaderFactsStore(() => storedHeaderFacts(ctx), HEADER_CACHE_TTL_MS)
}

/** SessionHeader → pure-logic tree structure. */
export function treeHeaderOf(header: SessionHeader): SessionTreeHeader {
  return {
    id: String(header.id),
    createdAt: header.createdAt,
    ...header.parentSession === undefined ? {} : { parentSession: String(header.parentSession) },
    ...header.origin === 'subagent' ? { origin: 'subagent' as const } : {},
  }
}

/** Ids of every node in the tree (pre-order, for batch title reads). */
export function treeIds(nodes: readonly SessionTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    out.push(node.header.id)
    out.push(...treeIds(node.children))
  }
  return out
}
