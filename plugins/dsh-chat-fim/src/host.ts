/**
 * dsh-chat-fim host half 组合根：宿主自检（能力门 + 会话格式门）→ 配置归一化 → 注册 exact 路由。
 * 路由分发、上游编排、诊断与会话解析都在 `host/` 下，本文件只做接线。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { assertCapabilities, assertHostCompatible } from './compat.js'
import { COMPLETE_ROUTE_PATH, MAX_DIAGNOSTIC_SESSIONS, name } from './constants.js'
import { normalizeConfig } from './config.js'
import type { ChatFimConfig } from './config.js'
import { bumpSessionDiagnostics } from './host/diagnostics.js'
import { createCompleteHandler } from './host/routes.js'
import { hostSessionFormatVersion } from './session-format.js'

// 给测试与包 API 的导出（原模块 re-export，路径不变）。
export { MAX_DIAGNOSTIC_SESSIONS, bumpSessionDiagnostics, name }
export type { DiagnosticKey } from './host/diagnostics.js'
export type { ChatFimConfig } from './config.js'
export type { ChatFimError } from './upstream.js'
export type { CompleteRequest } from './guards.js'

export const inject = ['webServer', 'sessions', 'credentials']

/**
 * host half 入口：注册路由，所有副作用都挂在 apply 的 effect 上。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入）。
 */
export function apply(ctx: Context, config: Readonly<Partial<ChatFimConfig>> = {}): void {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》，先于一切注册）：能力面与会话格式缺任一即整个停用。
  assertHostCompatible(ctx, name, hostSessionFormatVersion())
  assertCapabilities(ctx, name, [
    { name: 'webServer.register', ok: typeof ctx.webServer?.register === 'function' },
    { name: 'sessions.get', ok: typeof ctx.sessions?.get === 'function' },
    { name: 'credentials.resolve', ok: typeof ctx.credentials?.resolve === 'function' },
  ])
  const settings = normalizeConfig(config)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: COMPLETE_ROUTE_PATH,
    handler: createCompleteHandler(ctx, settings),
  }), `${name}: ${COMPLETE_ROUTE_PATH} route`)
}
