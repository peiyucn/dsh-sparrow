/**
 * host half 的启动门：宿主能力自检。任一门不通过即抛错 —— cordis 逐插件捕获 `apply` 异常并
 * 标 inactive，不影响 dsh 本体。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { assertCapabilities } from '../compat.js'
import { PACKAGE_NAME } from '../constants.js'

/** 本插件依赖的三个宿主面：REST 路由、存储域、agent 工具注册。 */
export function assertHostGates(ctx: Context): void {
  const storageDomain = (ctx as unknown as { storageDomain?: { open?: unknown } }).storageDomain
  const tools = (ctx as unknown as { tools?: { register?: unknown } }).tools
  assertCapabilities(ctx, PACKAGE_NAME, [
    { name: 'webServer.register', ok: typeof ctx.webServer?.register === 'function' },
    { name: 'storageDomain.open', ok: typeof storageDomain?.open === 'function' },
    { name: 'tools.register', ok: typeof tools?.register === 'function' },
  ])
}
