/**
 * dsh-desk-one host half composition root: gates -> open storage -> REST + agent tools.
 * Object logic lives in model.ts; storage in host/store.ts; HTTP shapes in host/router.ts.
 */

import type { Context } from '@deepseek-ai/cordis'
import { PREFIX } from './constants.js'
import { assertHostGates } from './host/gates.js'
import { createDeskRequestHandler } from './host/router.js'
import { DeskStore } from './host/store.js'
import { registerDeskTools } from './host/notes/tools.js'
import { registerGroupTools } from './host/tasks/group-tools.js'
import { registerTaskTools } from './host/tasks/tools.js'

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
  registerTaskTools(ctx, store)
  registerGroupTools(ctx, store)
}
