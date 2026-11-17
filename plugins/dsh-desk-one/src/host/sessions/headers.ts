

import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionLocation, SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import {
  createHeaderFactsStore, type HeaderFactsStore, type SessionTreeHeader, type SessionTreeNode,
} from './archive.js'
import { HEADER_CACHE_TTL_MS } from './constants.js'


export type HeaderFacts = {
  headers: SessionHeader[]
  sizes: Map<string, number>
  locations: Map<string, SessionLocation>
}


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


export function createHeaderStore(ctx: Context): HeaderFactsStore<HeaderFacts> {
  return createHeaderFactsStore(() => storedHeaderFacts(ctx), HEADER_CACHE_TTL_MS)
}


export function treeHeaderOf(header: SessionHeader): SessionTreeHeader {
  return {
    id: String(header.id),
    createdAt: header.createdAt,
    ...header.parentSession === undefined ? {} : { parentSession: String(header.parentSession) },
    ...header.origin === 'subagent' ? { origin: 'subagent' as const } : {},
  }
}


export function treeIds(nodes: readonly SessionTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    out.push(node.header.id)
    out.push(...treeIds(node.children))
  }
  return out
}
