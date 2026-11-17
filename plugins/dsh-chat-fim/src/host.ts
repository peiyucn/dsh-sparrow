

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { assertCapabilities, assertHostCompatible } from './compat.js'
import { COMPLETE_ROUTE_PATH, MAX_DIAGNOSTIC_SESSIONS, name } from './constants.js'
import { normalizeConfig } from './config.js'
import type { ChatFimConfig } from './config.js'
import { bumpSessionDiagnostics } from './host/diagnostics.js'
import { createCompleteHandler } from './host/routes.js'
import { hostSessionFormatVersion } from './session-format.js'


export { MAX_DIAGNOSTIC_SESSIONS, bumpSessionDiagnostics, name }
export type { DiagnosticKey } from './host/diagnostics.js'
export type { ChatFimConfig } from './config.js'
export type { ChatFimError } from './upstream.js'
export type { CompleteRequest } from './guards.js'

export const inject = ['webServer', 'sessions', 'credentials']


export function apply(ctx: Context, config: Readonly<Partial<ChatFimConfig>> = {}): void {

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
