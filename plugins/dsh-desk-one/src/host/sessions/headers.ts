/** Header facts cache: dual-shape read + TTL single-flight store, plus the header projection the host tree needs. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import {
  createHeaderFactsStore, type HeaderFactsStore, type SessionTreeHeader, type SessionTreeNode,
} from './archive.js'
import { HEADER_CACHE_TTL_MS } from './constants.js'

/** Payload type of the header facts cache: full headers + a snapshot size map. */
export type HeaderFacts = { headers: SessionHeader[]; sizes: Map<string, number> }

/**
 * Dual-shape compatible read of sessionPersistence.list():
 * - npm 0.1.2-alpha.5 and earlier: returns SessionHeader[] directly;
 * - master after the alpha.5 release (2026-09-02 session-persistence refactor): returns Snapshot[] ({ header, revision, ... }).
 * Branches on whether an element carries a header field, always returns SessionHeader[] (see the AGENTS plugin
 * private-seam exception), and collects sizeBytes, which only the snapshot shape has.
 */
async function storedHeaderFacts(ctx: Context): Promise<HeaderFacts> {
  const entries = await ctx.sessionPersistence.list() as readonly unknown[]
  const headers: SessionHeader[] = []
  const sizes = new Map<string, number>()
  for (const entry of entries) {
    const record = entry as Record<string, unknown> | null | undefined
    const header = record?.header
    if (typeof header === 'object' && header !== null && typeof (header as Record<string, unknown>).id === 'string') {
      headers.push(header as SessionHeader)
      const sizeBytes = record?.sizeBytes
      if (typeof sizeBytes === 'number') sizes.set(String((header as SessionHeader).id), sizeBytes)
    } else {
      headers.push(entry as SessionHeader)
    }
  }
  return { headers, sizes }
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
