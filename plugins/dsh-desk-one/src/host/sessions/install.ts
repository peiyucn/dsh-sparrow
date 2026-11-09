/**
 * Sessions host composition: format/capability gates → private-seam checks → header cache →
 * startup scans → route table. Mirrors the archived plugin's host root but mounts into desk-one's
 * own prefix router instead of registering a second webServer handler.
 */

import type { Context } from '@deepseek-ai/cordis'
import { normalizeArchiveConfig, type ArchiveConfig } from './archive.js'
import { assertHostGates, assertRegistryMutationApi, assertSessionLocationApi } from './gates.js'
import { createHeaderStore } from './headers.js'
import { resolveProjectionCacheDomain } from './projection.js'
import { createSessionRoutes, type SessionRouteEntry } from './routes.js'
import { installStartupScans } from './startup.js'
import { buildSessionIndex } from './index-sync.js'
import type { DeskStore } from '../store.js'
import { SESSION_INDEX_TTL_MS } from '../../constants.js'

export type SessionsConfig = Readonly<Partial<ArchiveConfig>>

export interface SessionsHost {
  readonly routes: readonly SessionRouteEntry[]
  /** Refresh the lightweight session index (TTL-bound unless forced). */
  refreshIndex: (force?: boolean) => Promise<number>
}

/**
 * Cheap structural presence check used by the composition root. A host without these services
 * (unit-test fakes, stripped builds) simply skips the session capabilities; a host that HAS them
 * but exposes the wrong surface still fails fast inside {@link installSessionsHost}.
 */
export function hasSessionServices(ctx: Context): boolean {
  const c = ctx as unknown as Record<string, unknown>
  const sessions = c.sessions as { get?: unknown } | undefined
  const storage = c.storageDomain as { open?: unknown } | undefined
  const web = c.webServer as { register?: unknown } | undefined
  const persistence = c.sessionPersistence as { locate?: unknown } | undefined
  return typeof sessions?.get === 'function'
    && c.agents !== undefined
    && c.workspaceRegistry !== undefined
    && typeof persistence?.locate === 'function'
    && c.sessionQuery !== undefined
    && typeof storage?.open === 'function'
    && typeof web?.register === 'function'
}

/**
 * Install the session capabilities into desk-one. Throws when a host surface or a private seam is
 * missing: the whole plugin then disables via cordis (same policy as the archived plugin).
 */
export async function installSessionsHost(ctx: Context, store: DeskStore, config: SessionsConfig = {}): Promise<SessionsHost> {
  // Format + capability gates run before any registration (an unknown host line disables us).
  assertHostGates(ctx)
  const settings = normalizeArchiveConfig(config)
  // Private seams: WorkspaceRegistry write channel and sessionPersistence.locate; missing = fail fast.
  const surface = assertRegistryMutationApi(ctx.workspaceRegistry)
  assertSessionLocationApi(ctx.sessionPersistence)
  await resolveProjectionCacheDomain()

  const headerFacts = createHeaderStore(ctx)
  const startup = installStartupScans(ctx, surface, headerFacts, settings.trashRoot)
  let lastIndexedAt = 0
  const refreshIndex = async (force = false): Promise<number> => {
    if (!force && Date.now() - lastIndexedAt < SESSION_INDEX_TTL_MS) return store.listSessionIndexes(undefined, 100).length
    try {
      const drafts = await buildSessionIndex(ctx, headerFacts)
      const result = await store.upsertSessionIndexes(drafts)
      lastIndexedAt = Date.now()
      return result.indexed
    } catch (error) {
      ctx.logger.warn(`dsh-desk-one: 会话索引刷新失败：${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }
  return {
    routes: createSessionRoutes({ ctx, settings, surface, headerFacts, startup }),
    refreshIndex,
  }
}
