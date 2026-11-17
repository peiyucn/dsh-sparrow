

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { assertCapabilities } from '../compat.js'
import { PACKAGE_NAME } from '../constants.js'


export function assertHostGates(ctx: Context): void {
  const storageDomain = (ctx as unknown as { storageDomain?: { open?: unknown } }).storageDomain
  const tools = (ctx as unknown as { tools?: { register?: unknown } }).tools
  assertCapabilities(ctx, PACKAGE_NAME, [
    { name: 'webServer.register', ok: typeof ctx.webServer?.register === 'function' },
    { name: 'storageDomain.open', ok: typeof storageDomain?.open === 'function' },
    { name: 'tools.register', ok: typeof tools?.register === 'function' },
  ])
}
