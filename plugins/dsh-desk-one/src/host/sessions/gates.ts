/**
 * Startup gates for the host half: host capability / session format self-checks plus the structural
 * check for the one remaining private seam (the WorkspaceRegistry write channel).
 * Any failing gate throws — cordis catches `apply` errors per plugin and marks it inactive, leaving dsh itself untouched.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-workspace'
import { assertCapabilities, assertHostCompatible } from './compat.js'
import { PACKAGE_NAME } from './constants.js'

/** Two-tier gate: host capabilities + session format (throwing means self-disable). */
export function assertHostGates(ctx: Context): void {
  // This plugin moves/deletes session files by directory — better to disable than perform irreversible operations on an unknown format.
  assertHostCompatible(ctx, PACKAGE_NAME)
  assertCapabilities(ctx, PACKAGE_NAME, [
    { name: 'webServer.register', ok: typeof ctx.webServer?.register === 'function' },
    { name: 'sessions', ok: ctx.sessions !== undefined },
    { name: 'agents', ok: ctx.agents !== undefined },
    { name: 'workspaceRegistry', ok: ctx.workspaceRegistry !== undefined },
    { name: 'sessionPersistence.list', ok: typeof ctx.sessionPersistence?.list === 'function' },
    { name: 'sessionQuery', ok: ctx.sessionQuery !== undefined },
    { name: 'storageDomain', ok: ctx.storageDomain !== undefined },
  ])
}

/**
 * Private write surface of the official WorkspaceRegistry (private-seam dependency, approved as an AGENTS tier-3 exception, 2026-09-01):
 * TS private is only a compile-time constraint and the JS runtime members really exist; the community plugin (huahai0202/dsh-better-archive)
 * uses the same channel. The channel's value: enqueueOperation (the official serialized write chain, mutually exclusive with every official
 * write, no queue of our own) + requireState/setState (official persisted writes — domain and in-memory state move in one step, eliminating
 * the ghost-write problem at the mechanism level).
 */
export interface RegistryMutationSurface {
  readonly enqueueOperation: <T>(operation: () => Promise<T>) => Promise<T>
  readonly requireState: () => WorkspaceDomainState
  readonly setState: (state: WorkspaceDomainState) => Promise<void>
}

const REGISTRY_MUTATION_METHODS = ['enqueueOperation', 'requireState', 'setState'] as const

/**
 * Startup capability check (private-seam guardrail): fail fast when an official upgrade changes the private surface.
 * A throw only makes this plugin unavailable — cordis catches plugin startup errors per plugin and logs them via
 * logger.error, leaving dsh itself and other plugins unaffected (verified in cordis lib/index.js).
 */
export function assertRegistryMutationApi(registry: unknown): RegistryMutationSurface {
  const missing = REGISTRY_MUTATION_METHODS.filter(method => typeof (registry as Record<string, unknown>)?.[method] !== 'function')
  if (missing.length > 0) {
    throw new Error(`不支持的 DSH workspace registry：缺少私有写入方法 ${missing.join('、')}；请升级插件以匹配当前 dsh 版本`)
  }
  return registry as unknown as RegistryMutationSurface
}
