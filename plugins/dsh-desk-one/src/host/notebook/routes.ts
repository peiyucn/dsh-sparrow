/** Notebook REST routes: handlers only; mounting and the trust fence live in host/router.ts. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_QUERY_CHARS, ROUTES } from '../../constants.js'
import type {
  NotebookRootRequest, NotebookSearchResponse, NotebookStateResponse,
} from '../../contract.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'

/** Resolve the notebook host or fail loudly: the routes are only mounted with it. */
function notebookOf(route: DeskRouteContext) {
  if (route.notebook === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '笔记库能力未安装', 503)
  return route.notebook
}

async function stateRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const state = await notebookOf(route).state()
  sendJson(res, 200, state satisfies NotebookStateResponse)
}

async function setRootRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<NotebookRootRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.rootPath !== 'string' || body.rootPath.trim() === '') {
    throw new DeskError('BAD_BODY', '缺少笔记库目录路径')
  }
  await notebookOf(route).setRoot(body.rootPath.trim())
  const state = await notebookOf(route).state()
  sendJson(res, 200, state satisfies NotebookStateResponse)
}

async function searchRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY_CHARS)
  const type = url.searchParams.get('type') ?? undefined
  const tag = url.searchParams.get('tag') ?? undefined
  const rawLimit = Number(url.searchParams.get('limit') ?? '')
  const result = await notebookOf(route).search({
    query,
    ...type === null || type === '' ? {} : { type },
    ...tag === null || tag === '' ? {} : { tag },
    ...Number.isInteger(rawLimit) && rawLimit > 0 ? { limit: rawLimit } : {},
  })
  sendJson(res, 200, result satisfies NotebookSearchResponse)
}

async function clearRootRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  await notebookOf(route).clearRoot()
  const state = await notebookOf(route).state()
  sendJson(res, 200, state satisfies NotebookStateResponse)
}

export const NOTEBOOK_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.notebookState, handle: stateRoute },
  { method: 'POST', path: ROUTES.notebookRoot, handle: setRootRoute },
  { method: 'DELETE', path: ROUTES.notebookRoot, handle: clearRootRoute },
  { method: 'GET', path: ROUTES.notebookSearch, handle: searchRoute },
]
