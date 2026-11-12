/** Notebook REST routes: library state, root setting, search, page reads, and the draft box. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute } from 'node:path'
import { ROUTES } from '../../constants.js'
import type { NoteDraftRequest, NotebookRootRequest } from '../../notebook-contract.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'

async function stateRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = route.notebook
  if (notebook === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '笔记库不可用', 503)
  sendJson(res, 200, await notebook.state())
}

async function setRootRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = route.notebook
  if (notebook === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '笔记库不可用', 503)
  const body = bodyObject<NotebookRootRequest>(await readJsonBody(req), '请求体必须是对象')
  const rootPath = typeof body.rootPath === 'string' ? body.rootPath.trim() : ''
  if (rootPath === '' || !isAbsolute(rootPath)) throw new DeskError('BAD_BODY', '笔记库必须是绝对路径')
  await route.store.saveNotebookRoot(rootPath)
  notebook.invalidate()
  sendJson(res, 200, await notebook.state())
}

async function clearRootRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = route.notebook
  if (notebook === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '笔记库不可用', 503)
  await route.store.clearNotebookRoot()
  notebook.invalidate()
  sendJson(res, 200, await notebook.state())
}

async function searchRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = route.notebook
  if (notebook === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '笔记库不可用', 503)
  const url = new URL(req.url ?? '/', 'http://localhost')
  const limitRaw = Number(url.searchParams.get('limit') ?? '')
  sendJson(res, 200, await notebook.search({
    ...url.searchParams.get('q') === null ? {} : { query: url.searchParams.get('q') ?? '' },
    ...url.searchParams.get('type') === null ? {} : { type: url.searchParams.get('type') ?? '' },
    ...url.searchParams.get('tag') === null ? {} : { tag: url.searchParams.get('tag') ?? '' },
    missingFrontmatter: url.searchParams.get('missing') === '1',
    emptyBody: url.searchParams.get('empty') === '1',
    ...Number.isFinite(limitRaw) && limitRaw > 0 ? { limit: Math.min(Math.floor(limitRaw), 200) } : {},
  }))
}

async function pageRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = route.notebook
  if (notebook === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '笔记库不可用', 503)
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.searchParams.get('path') ?? ''
  if (path === '') throw new DeskError('BAD_BODY', '缺少 path')
  sendJson(res, 200, await notebook.page(path))
}

async function draftGetRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const cwd = url.searchParams.get('cwd') ?? ''
  const path = url.searchParams.get('path') ?? ''
  if (cwd === '' || path === '') throw new DeskError('BAD_BODY', '缺少 cwd 或 path')
  const draft = route.store.getNoteDraft(cwd, path) ?? null
  sendJson(res, 200, { draft })
}

async function draftSaveRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<NoteDraftRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.cwd !== 'string' || body.cwd === '' || typeof body.path !== 'string' || body.path === '') {
    throw new DeskError('BAD_BODY', '缺少 cwd 或 path')
  }
  if (!Array.isArray(body.drafts)) throw new DeskError('BAD_BODY', 'drafts 必须是数组')
  const draft = await route.store.saveNoteDraft({ cwd: body.cwd, path: body.path, drafts: body.drafts })
  sendJson(res, 200, { draft })
}

export const NOTEBOOK_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.notebookState, handle: stateRoute },
  { method: 'POST', path: ROUTES.notebookRoot, handle: setRootRoute },
  { method: 'DELETE', path: ROUTES.notebookRoot, handle: clearRootRoute },
  { method: 'GET', path: ROUTES.notebookSearch, handle: searchRoute },
  { method: 'GET', path: ROUTES.notebookPage, handle: pageRoute },
  { method: 'GET', path: ROUTES.notebookDraft, handle: draftGetRoute },
  { method: 'POST', path: ROUTES.notebookDraft, handle: draftSaveRoute },
]
