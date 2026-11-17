

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


export function assertHostGates(ctx: Context): void {

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


export interface RegistryMutationSurface {
  readonly enqueueOperation: <T>(operation: () => Promise<T>) => Promise<T>
  readonly requireState: () => WorkspaceDomainState
  readonly setState: (state: WorkspaceDomainState) => Promise<void>
}

const REGISTRY_MUTATION_METHODS = ['enqueueOperation', 'requireState', 'setState'] as const


export function assertRegistryMutationApi(registry: unknown): RegistryMutationSurface {
  const missing = REGISTRY_MUTATION_METHODS.filter(method => typeof (registry as Record<string, unknown>)?.[method] !== 'function')
  if (missing.length > 0) {
    throw new Error(`不支持的 DSH workspace registry：缺少私有写入方法 ${missing.join('、')}；请升级插件以匹配当前 dsh 版本`)
  }
  return registry as unknown as RegistryMutationSurface
}
