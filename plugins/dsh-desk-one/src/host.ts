/**
 * dsh-desk-one host half 的组合根：启动门 → 打开存储域 → 注册 REST 路由与 agent 工具。
 * 具体对象逻辑在 model.ts，存储读取在 host/store.ts，HTTP 形状在 host/routes.ts。
 */

import type { Context } from '@deepseek-ai/cordis'
import { PREFIX } from './constants.js'
import { assertHostGates } from './host/gates.js'
import { createDeskRequestHandler } from './host/router.js'
import { DeskStore } from './host/notes/store.js'
import { registerDeskTools } from './host/notes/tools.js'

export const name = 'dsh-desk-one'
export const inject = ['webServer', 'storageDomain', 'tools']

/**
 * host half 入口：打开统一对象存储、挂 REST 路由与工具。
 * @param ctx - DSH 插件上下文。
 */
export async function apply(ctx: Context): Promise<void> {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》，先于一切注册）：能力缺失即抛错自停用。
  assertHostGates(ctx)

  const store = await DeskStore.open(ctx)
  ctx.effect(() => () => store.close(), 'dsh-desk-one: storage domain')

  const handler = createDeskRequestHandler({ ctx, store })
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler,
  }), 'dsh-desk-one: REST routes')

  registerDeskTools(ctx, store)
}
