/** Notebook REST routes: library state, root setting, search, page reads, files, drafts, history. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute } from 'node:path'
import { ROUTES } from '../../constants.js'
import type {
  CreateNotebookNoteRequest, DeleteReviewRequest, NoteDraftRequest, NotebookRootRequest, RecordReviewRequest,
} from '../../notebook-contract.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'

/** Notebook host or an unavailable error. */
function notebookOf(route: DeskRouteContext) {
  const notebook = route.notebook
  if (notebook === undefined) throw new DeskError('NOTEBOOK_UNAVAILABLE', '笔记库不可用', 503)
  return notebook
}

async function stateRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, await notebookOf(route).state())
}

async function setRootRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = notebookOf(route)
  const body = bodyObject<NotebookRootRequest>(await readJsonBody(req), '请求体必须是对象')
  const rootPath = typeof body.rootPath === 'string' ? body.rootPath.trim() : ''
  if (rootPath === '' || !isAbsolute(rootPath)) throw new DeskError('BAD_BODY', '笔记库必须是绝对路径')
  await route.store.saveNotebookRoot(rootPath)
  notebook.invalidate()
  sendJson(res, 200, await notebook.state())
}

async function clearRootRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = notebookOf(route)
  await route.store.clearNotebookRoot()
  notebook.invalidate()
  sendJson(res, 200, await notebook.state())
}

async function searchRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const notebook = notebookOf(route)
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

async function treeRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const folder = url.searchParams.get('path') ?? ''
  const offsetRaw = Number(url.searchParams.get('offset') ?? '0')
  const limitRaw = Number(url.searchParams.get('limit') ?? '50')
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50
  sendJson(res, 200, await notebookOf(route).tree(folder, offset, limit))
}

async function pageRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.searchParams.get('path') ?? ''
  if (path === '') throw new DeskError('BAD_BODY', '缺少 path')
  sendJson(res, 200, await notebookOf(route).page(path))
}

async function fileRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<{ path?: string }>(await readJsonBody(req), '请求体必须是对象')
  const path = typeof body.path === 'string' ? body.path : ''
  if (path === '') throw new DeskError('BAD_BODY', '缺少 path')
  sendJson(res, 200, await notebookOf(route).ensureFile(path))
}

async function createRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<CreateNotebookNoteRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.title !== 'string') throw new DeskError('BAD_BODY', '缺少标题')
  sendJson(res, 201, await notebookOf(route).createNote({
    title: body.title,
    ...body.folder === undefined ? {} : { folder: body.folder },
  }))
}

async function draftGetRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const fileId = url.searchParams.get('fileId') ?? ''
  if (fileId === '') throw new DeskError('BAD_BODY', '缺少 fileId')
  sendJson(res, 200, { draft: notebookOf(route).draft(fileId) })
}

async function draftSaveRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<NoteDraftRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.fileId !== 'string' || body.fileId === '') throw new DeskError('BAD_BODY', '缺少 fileId')
  if (!Array.isArray(body.drafts)) throw new DeskError('BAD_BODY', 'drafts 必须是数组')
  const file = route.store.getNoteFile(body.fileId)
  if (file === undefined) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)
  const draft = await route.store.saveNoteDraft({
    rootPath: file.rootPath,
    path: file.path,
    fileId: file.id,
    drafts: body.drafts,
  })
  sendJson(res, 200, { draft })
}

async function historyGetRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, await notebookOf(route).history())
}

async function historyRecordRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<RecordReviewRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.sessionId !== 'string' || body.sessionId === '') throw new DeskError('BAD_BODY', '缺少 sessionId')
  if (typeof body.fileId !== 'string' || body.fileId === '') throw new DeskError('BAD_BODY', '缺少 fileId')
  if (!Array.isArray(body.annotations)) throw new DeskError('BAD_BODY', 'annotations 必须是数组')
  const record = await notebookOf(route).recordReview({
    sessionId: body.sessionId,
    ...body.workspaceId === undefined ? {} : { workspaceId: body.workspaceId },
    fileId: body.fileId,
    annotations: body.annotations,
  })
  sendJson(res, 201, { record })
}

async function historyDeleteRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<DeleteReviewRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id === '') throw new DeskError('BAD_BODY', '缺少 id')
  await notebookOf(route).deleteHistory(body.id)
  sendJson(res, 200, { ok: true })
}

export const NOTEBOOK_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.notebookState, handle: stateRoute },
  { method: 'POST', path: ROUTES.notebookRoot, handle: setRootRoute },
  { method: 'DELETE', path: ROUTES.notebookRoot, handle: clearRootRoute },
  { method: 'GET', path: ROUTES.notebookSearch, handle: searchRoute },
  { method: 'GET', path: ROUTES.notebookTree, handle: treeRoute },
  { method: 'GET', path: ROUTES.notebookPage, handle: pageRoute },
  { method: 'POST', path: ROUTES.notebookFile, handle: fileRoute },
  { method: 'POST', path: ROUTES.notebookCreate, handle: createRoute },
  { method: 'GET', path: ROUTES.notebookDraft, handle: draftGetRoute },
  { method: 'POST', path: ROUTES.notebookDraft, handle: draftSaveRoute },
  { method: 'GET', path: ROUTES.notebookHistory, handle: historyGetRoute },
  { method: 'POST', path: ROUTES.notebookHistory, handle: historyRecordRoute },
  { method: 'DELETE', path: ROUTES.notebookHistory, handle: historyDeleteRoute },
]
