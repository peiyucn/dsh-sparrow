/** dsh-file-manage host half 组合根：能力门 → 官方面自检 → 注册 REST 路由（实现见 routes.ts）。 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { assertCapabilities } from './compat.js'
import { PACKAGE_NAME, PREFIX } from './constants.js'
import { createRouteHandler } from './routes.js'
import { deepSeekSurface } from './surface.js'

export const name = PACKAGE_NAME
export const inject = ['webServer', 'credentials', 'settings']

/** host half 入口：宿主能力或官方面缺失即自停用；所有副作用挂在 effect 上。 */
export async function apply(ctx: Context): Promise<void> {
  assertCapabilities(ctx, name, [
    { name: 'webServer.register', ok: typeof (ctx.webServer as { register?: unknown } | undefined)?.register === 'function' },
    { name: 'credentials.resolve', ok: typeof (ctx.credentials as { resolve?: unknown } | undefined)?.resolve === 'function' },
    { name: 'settings.describe', ok: typeof (ctx.settings as { describe?: unknown } | undefined)?.describe === 'function' },
  ])
  await deepSeekSurface()
  const handler = createRouteHandler(ctx)
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler }), `${name}: REST routes`)
}
