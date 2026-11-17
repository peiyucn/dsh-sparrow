

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { ROUTES } from '../constants.js'
import { isTrustedPluginRequest, officialTrustedHosts } from '../trust.js'
import { DeskError, sendError, sendJson } from './http.js'
import { NOTE_ROUTES } from './notes/routes.js'
import { GROUP_ROUTES } from './tasks/group-routes.js'
import { TASK_ROUTES } from './tasks/routes.js'
import { SCHEDULE_ROUTES } from './schedule/routes.js'
import type { DeskStore } from './store.js'
import type { ScheduleHost } from './schedule/host.js'
import type { NotebookHost } from './notebook/host.js'
import { NOTEBOOK_ROUTES } from './notebook/routes.js'
import type { SessionsHost } from './sessions/install.js'


export interface DeskRouteContext {
  readonly ctx: Context
  readonly store: DeskStore

  readonly schedule?: ScheduleHost

  readonly notebook?: NotebookHost

  readonly sessions?: SessionsHost
}

export type RouteHandler = (route: DeskRouteContext, req: IncomingMessage, res: ServerResponse) => Promise<void>

export interface DeskRouteEntry {
  readonly method: string
  readonly path: string
  readonly handle: RouteHandler
}


const BASE_ROUTE_TABLE: readonly DeskRouteEntry[] = [
  ...NOTE_ROUTES, ...TASK_ROUTES, ...GROUP_ROUTES, ...SCHEDULE_ROUTES, ...NOTEBOOK_ROUTES,
]


function isLoopbackOauthCallback(req: IncomingMessage, pathname: string): boolean {
  if (req.method !== 'GET' || pathname !== ROUTES.scheduleOutlookCallback) return false
  const host = (req.headers.host ?? '').toLowerCase()
  const hostname = host.replace(/:\d+$/u, '')
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}


export function createDeskRequestHandler(route: DeskRouteContext): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const routes: readonly DeskRouteEntry[] = route.sessions === undefined
    ? BASE_ROUTE_TABLE
    : [...BASE_ROUTE_TABLE, ...route.sessions.routes]
  return async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    try {


      if (!isLoopbackOauthCallback(req, pathname)
        && !isTrustedPluginRequest(req.headers, officialTrustedHosts(route.ctx))) {
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
