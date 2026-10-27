/**
 * dsh-archive-manage host half 的组合根：启动门 → 装配路由 → 启动清扫接线。
 * 具体能力/投影 seam、标题、回收站与文件搬运在 `host/` 各域模块。
 */

import type { Context } from '@deepseek-ai/cordis'
import { normalizeArchiveConfig, type ArchiveConfig } from './archive.js'
import { PACKAGE_NAME, PREFIX } from './constants.js'
import { assertHostGates, assertRegistryMutationApi, assertSessionLocationApi } from './host/gates.js'
import { createHeaderStore } from './host/headers.js'
import { resolveProjectionCacheDomain } from './host/projection.js'
import { createArchiveRequestHandler } from './host/routes.js'
import { installStartupScans } from './host/startup.js'

export const name = PACKAGE_NAME
export const inject = ['webServer', 'sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery', 'storageDomain']

export type { ArchiveConfig }

/**
 * host half 入口：归档会话管理路由。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export async function apply(ctx: Context, config: Readonly<Partial<ArchiveConfig>> = {}): Promise<void> {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》，先于一切注册）：会话格式不认识就整个停用。
  assertHostGates(ctx)
  const settings = normalizeArchiveConfig(config)
  // 私有 seam 依赖：官方 WorkspaceRegistry 写通道与 sessionPersistence.locate；缺失即 fail-fast。
  const surface = assertRegistryMutationApi(ctx.workspaceRegistry)
  assertSessionLocationApi(ctx.sessionPersistence)
  await resolveProjectionCacheDomain()

  const headerFacts = createHeaderStore(ctx)
  const startup = installStartupScans(ctx, surface, headerFacts)
  const handler = createArchiveRequestHandler({ ctx, settings, surface, headerFacts, startup })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler,
  }), 'dsh-archive-manage: REST routes')
}
