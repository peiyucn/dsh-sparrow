

import { hasCapability, type HostCapability } from '../compat.js'


export interface ClientCapabilityHost {
  readonly slots?: { readonly inject?: unknown; readonly register?: unknown }
  readonly locale?: { readonly register?: unknown; readonly bind?: unknown }
  readonly sessions?: { readonly scope?: unknown }
}


export function clientCapabilities(host: ClientCapabilityHost): HostCapability[] {
  return [
    { name: 'ctx.slots.inject', ok: hasCapability(() => host.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => host.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => host.locale?.register) },
    { name: 'ctx.locale.bind', ok: hasCapability(() => host.locale?.bind) },
    { name: 'ctx.sessions.scope', ok: hasCapability(() => host.sessions?.scope) },
  ]
}
