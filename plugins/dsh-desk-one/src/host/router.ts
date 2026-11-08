/**
 * Prefix router: trust fence first, then table lookup, then the feature handlers.
 *
 * Feature modules only contribute route entries; mounting, fencing and error mapping live here,
 * so adding tasks/calendar never requires editing the security-sensitive part.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isTrustedPluginRequest, officialTrustedHosts } from '../trust.js'
import { DeskError, sendError, sendJson } from './http.js'
import { NOTE_ROUTES } from './notes/routes.js'
import { GROUP_ROUTES } from './tasks/group-routes.js'
import { TASK_ROUTES } from './tasks/routes.js'
import { SCHEDULE_ROUTES } from './schedule/routes.js'
import type { DeskStore } from './store.js'
import type { ScheduleHost } from './schedule/host.js'
import type { SessionsHost } from './sessions/install.js'

/** Collaborators available to one feature request. */
export interface DeskRouteContext {
  readonly ctx: Context
  readonly store: DeskStore
  /** Schedule orchestration (optional so read-only tests can mount the router without it). */
  readonly schedule?: ScheduleHost
  /** Session archive capabilities; routes are appended when installed. */
  readonly sessions?: SessionsHost
}

export type RouteHandler = (route: DeskRouteContext, req: IncomingMessage, res: ServerResponse) => Promise<void>

export interface DeskRouteEntry {
  readonly method: string
  readonly path: string
  readonly handle: RouteHandler
}

/** All built-in HTTP routes; session routes are appended at handler creation when installed. */
const BASE_ROUTE_TABLE: readonly DeskRouteEntry[] = [
  ...NOTE_ROUTES, ...TASK_ROUTES, ...GROUP_ROUTES, ...SCHEDULE_ROUTES,
]

/** Build the prefix handler: fence -> exact match -> feature handler, with unified error mapping. */
export function createDeskRequestHandler(route: DeskRouteContext): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const routes: readonly DeskRouteEntry[] = route.sessions === undefined
    ? BASE_ROUTE_TABLE
    : [...BASE_ROUTE_TABLE, ...route.sessions.routes]
  return async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    try {
      // The fence runs before any route (read-only included): our prefix is longer than the
      // official `/api` fence, so the host-level check would not fire for requests under it.
      if (!isTrustedPluginRequest(req.headers, officialTrustedHosts(route.ctx))) {
        sendError(route.ctx, res, new DeskError('FORBIDDEN', '拒绝非本机同源的请求', 403))
        return
      }
      const match = routes.find(entry => entry.method === req.method && entry.path === pathname)
      if (match === undefined) {
        sendJson(res, 404, { error: { code: 'BAD_BODY', message: '未知的 desk-one 路由：' + pathname } })
        return
      }
      await match.handle(route, req, res)
    } catch (error) {
      sendError(route.ctx, res, error)
    }
  }
}
