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
 * host-half entry: opens the shared object store, mounts REST routes and agent tools.
 * @param ctx - DSH plugin context.
 * @param config - Plugin config injected by cordis.patch.yml (trashRoot).
 */
export async function apply(ctx: Context, config: SessionsConfig = {}): Promise<void> {
  // Host compatibility gate (root AGENTS "plugin/host compatibility"), before any registration:
// a missing capability throws so the plugin disables itself instead of breaking dsh.
  assertHostGates(ctx)
  // Session gates include the session-format probe + the two private seams; failing here disables
  // the plugin before any storage/effect is registered. Hosts without the services (unit tests,
  // stripped builds) simply skip the session capabilities.
  const store = await DeskStore.open(ctx)
  ctx.effect(() => () => store.close(), 'dsh-desk-one: storage domain')
  // Session gates include the session-format probe + the two private seams; failing here disables
  // the plugin before any storage/effect is registered. Hosts without the services (unit tests,
  // stripped builds) simply skip the session capabilities.
  const sessions = hasSessionServices(ctx) ? await installSessionsHost(ctx, store, config) : undefined

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
  if (sessions !== undefined) {
    // Warm the session index at startup; task/session edges resolve through it (no extra agent
    // search tool: official session tools already cover full-text search).
    void sessions.refreshIndex().catch(() => undefined)
  }
}
