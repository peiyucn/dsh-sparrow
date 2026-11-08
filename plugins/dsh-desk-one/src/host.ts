/**
 * dsh-desk-one host half composition root: gates -> open storage -> REST + agent tools.
 * Object logic lives in model.ts; storage in host/store.ts; HTTP shapes in host/router.ts.
 */

import type { Context } from '@deepseek-ai/cordis'
import { PREFIX } from './constants.js'
import { assertHostGates } from './host/gates.js'
import { createDeskRequestHandler } from './host/router.js'
import { DeskStore } from './host/store.js'
import { ScheduleHost } from './host/schedule/host.js'
import { registerScheduleTools } from './host/schedule/tools.js'
import { installSessionsHost, hasSessionServices, type SessionsConfig } from './host/sessions/install.js'
import { registerDeskTools } from './host/notes/tools.js'
import { registerGroupTools } from './host/tasks/group-tools.js'
import { registerTaskTools } from './host/tasks/tools.js'

export const name = 'dsh-desk-one'
export const inject = [
  'webServer', 'storageDomain', 'tools',
  // Session archive capabilities (A1): same hard dependencies as the archived plugin, so a host
  // missing one disables the whole panel instead of mounting half of it.
  'sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery',
]

/**
 * host half 入口：打开统一对象存储、挂 REST 路由与工具。
 * @param ctx - DSH 插件上下文。
 * @param config - 插件配置（cordis.patch.yml 注入：trashRoot）。
 */
export async function apply(ctx: Context, config: SessionsConfig = {}): Promise<void> {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》，先于一切注册）：能力缺失即抛错自停用。
  assertHostGates(ctx)
  // Session gates include the session-format probe + the two private seams; failing here disables
  // the plugin before any storage/effect is registered. Hosts without the services (unit tests,
  // stripped builds) simply skip the session capabilities.
  const sessions = hasSessionServices(ctx) ? await installSessionsHost(ctx, config) : undefined

  const store = await DeskStore.open(ctx)
  ctx.effect(() => () => store.close(), 'dsh-desk-one: storage domain')

  const schedule = new ScheduleHost(ctx, store)
  const handler = createDeskRequestHandler({ ctx, store, schedule, sessions })
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler,
  }), 'dsh-desk-one: REST routes')

  registerDeskTools(ctx, store)
  registerTaskTools(ctx, store)
  registerGroupTools(ctx, store)
  registerScheduleTools(ctx, schedule)
}
