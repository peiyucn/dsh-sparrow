

import type { Context } from '@deepseek-ai/cordis'
import { normalizeArchiveConfig, type ArchiveConfig } from './archive.js'
import { assertHostGates, assertRegistryMutationApi } from './gates.js'
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

  refreshIndex: (force?: boolean) => Promise<number>
}


export function hasSessionServices(ctx: Context): boolean {
  const c = ctx as unknown as Record<string, unknown>
  const sessions = c.sessions as { get?: unknown } | undefined
  const storage = c.storageDomain as { open?: unknown } | undefined
  const web = c.webServer as { register?: unknown } | undefined
  const persistence = c.sessionPersistence as { list?: unknown } | undefined
  return typeof sessions?.get === 'function'
    && c.agents !== undefined
    && c.workspaceRegistry !== undefined
    && typeof persistence?.list === 'function'
    && c.sessionQuery !== undefined
    && typeof storage?.open === 'function'
    && typeof web?.register === 'function'
}


export async function installSessionsHost(ctx: Context, store: DeskStore, config: SessionsConfig = {}): Promise<SessionsHost> {

  assertHostGates(ctx)
  const settings = normalizeArchiveConfig(config)


  const surface = assertRegistryMutationApi(ctx.workspaceRegistry)
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
