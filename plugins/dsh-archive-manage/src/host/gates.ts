/**
 * host half 的启动门：宿主能力 / 会话格式自检，加两处私有 seam 的结构自检。
 * 任一门不通过即抛错 —— cordis 逐插件捕获 `apply` 异常并标 inactive，不影响 dsh 本体。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-workspace'
import { assertCapabilities, assertHostCompatible } from '../compat.js'
import { PACKAGE_NAME } from '../constants.js'

/** 宿主能力 + 会话格式两档门（抛错即自停用）。 */
export function assertHostGates(ctx: Context): void {
  // 本插件按目录移动/删除会话文件——宁可停用，也不要在不认识的格式上执行不可逆操作。
  assertHostCompatible(ctx, PACKAGE_NAME)
  assertCapabilities(ctx, PACKAGE_NAME, [
    { name: 'webServer.register', ok: typeof ctx.webServer?.register === 'function' },
    { name: 'sessions', ok: ctx.sessions !== undefined },
    { name: 'agents', ok: ctx.agents !== undefined },
    { name: 'workspaceRegistry', ok: ctx.workspaceRegistry !== undefined },
    { name: 'sessionPersistence.locate', ok: typeof (ctx.sessionPersistence as unknown as { locate?: unknown }).locate === 'function' },
    { name: 'sessionQuery', ok: ctx.sessionQuery !== undefined },
    { name: 'storageDomain', ok: ctx.storageDomain !== undefined },
  ])
}

/**
 * 官方 WorkspaceRegistry 的私有写入面（私有 seam 依赖，AGENTS 三档特例已批，2026-09-01）：
 * TS private 只是编译期约束，JS 运行时成员真实存在；社区插件（huahai0202/dsh-better-archive）
 * 同款通道。通道价值：enqueueOperation（官方写串行链，与官方一切写操作互斥，无需自建队列）+
 * requireState/setState（官方持久化写——域与内存态一步同步，从机制上消除直写域的幽灵问题）。
 */
export interface RegistryMutationSurface {
  readonly enqueueOperation: <T>(operation: () => Promise<T>) => Promise<T>
  readonly requireState: () => WorkspaceDomainState
  readonly setState: (state: WorkspaceDomainState) => Promise<void>
}

const REGISTRY_MUTATION_METHODS = ['enqueueOperation', 'requireState', 'setState'] as const

/**
 * 启动能力检查（私有 seam 护栏）：官方升级改动 private surface 时 fail-fast。
 * 抛错只让本插件不可用——cordis 对插件启动错误逐插件捕获并 logger.error，
 * 不影响 dsh 本体与其余插件（已查证 cordis lib/index.js）。
 */
export function assertRegistryMutationApi(registry: unknown): RegistryMutationSurface {
  const missing = REGISTRY_MUTATION_METHODS.filter(method => typeof (registry as Record<string, unknown>)?.[method] !== 'function')
  if (missing.length > 0) {
    throw new Error(`不支持的 DSH workspace registry：缺少私有写入方法 ${missing.join('、')}；请升级插件以匹配当前 dsh 版本`)
  }
  return registry as unknown as RegistryMutationSurface
}

/**
 * 私有 locate 方法的返回形状：本插件只用到 kind 与 path（见 sessionDirectoryFor）。
 * 0.1.5-rc.1 起官方不再把它放在公开 SessionPersistence 类型上，故不能直接用该类型。
 */
export interface SessionLocationLike {
  readonly kind: string
  readonly path: string
}

/** 受检后的私有 locate 访问器。 */
export interface SessionLocationApi {
  locate(header: SessionHeader): SessionLocationLike | undefined
}

/**
 * 私有 seam 依赖：sessionPersistence.locate。alpha.5 发布后的 master 把它从公开服务契约
 * 降为 jsonl 后端私有方法，0.1.5-rc.1 已从公开类型 `SessionPersistence` 上消失（运行时成员仍在，
 * 插件只读使用、不替换不覆写）。缺失即 fail-fast，并返回结构化访问器供各调用点使用
 * （与 registry 写通道同款护栏）。
 */
export function assertSessionLocationApi(persistence: unknown): SessionLocationApi {
  const locate = (persistence as Record<string, unknown> | null | undefined)?.locate
  if (typeof locate !== 'function') {
    throw new Error('不支持的 DSH session persistence：缺少私有 locate 方法；请升级插件以匹配当前 dsh 版本')
  }
  return persistence as unknown as SessionLocationApi
}
