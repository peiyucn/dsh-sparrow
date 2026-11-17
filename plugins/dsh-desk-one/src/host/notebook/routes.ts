

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute } from 'node:path'
import { ROUTES, NOTEBOOK_WRITE_BODY_BYTES } from '../../constants.js'
import type {
  DeleteReviewRequest, MarkReviewSessionRequest, NoteBaselineRequest, NoteDraftRequest, NotebookRootRequest,
  RecordReviewRequest,
} from '../../notebook-contract.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'
import { workspaceRootOf } from './workspace-root.js'


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

async function listRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const offsetRaw = Number(url.searchParams.get('offset') ?? '')
  const limitRaw = Number(url.searchParams.get('limit') ?? '')
  sendJson(res, 200, await notebookOf(route).list({
    ...Number.isFinite(offsetRaw) && offsetRaw > 0 ? { offset: Math.floor(offsetRaw) } : {},
    ...Number.isFinite(limitRaw) && limitRaw > 0 ? { limit: Math.floor(limitRaw) } : {},
    missingFrontmatter: url.searchParams.get('missing') === '1',
  }))
}

async function fileRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<{ path?: string }>(await readJsonBody(req), '请求体必须是对象')
  const path = typeof body.path === 'string' ? body.path : ''
  if (path === '') throw new DeskError('BAD_BODY', '缺少 path')
  sendJson(res, 200, await notebookOf(route).ensureFile(path))
}


async function openRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<{ workspaceId?: string; path?: string }>(await readJsonBody(req), '请求体必须是对象')
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
  const path = typeof body.path === 'string' ? body.path : ''
  if (workspaceId === '') throw new DeskError('BAD_BODY', '缺少 workspaceId')
  if (path === '') throw new DeskError('BAD_BODY', '缺少 path')
  sendJson(res, 200, await notebookOf(route).openAt(workspaceRootOf(route.ctx.workspaceRegistry, workspaceId), path))
}


async function openByIdRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const fileId = url.searchParams.get('fileId') ?? ''
  if (fileId === '') throw new DeskError('BAD_BODY', '缺少 fileId')
  sendJson(res, 200, await notebookOf(route).openById(fileId))
}

async function reviewSessionsGetRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const markers = route.store.listReviewSessions()
  sendJson(res, 200, {
    sessionIds: markers.map(marker => marker.sessionId),
    sessions: markers.map(marker => ({
      sessionId: marker.sessionId,
      ...marker.workspaceId === undefined ? {} : { workspaceId: marker.workspaceId },
      ...marker.fileId === undefined ? {} : { fileId: marker.fileId },
      updatedAt: marker.updatedAt,
    })),
  })
}

async function reviewSessionMarkRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<MarkReviewSessionRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.sessionId !== 'string' || body.sessionId === '') throw new DeskError('BAD_BODY', '缺少 sessionId')
  const marker = await route.store.markReviewSession({
    sessionId: body.sessionId,
    ...typeof body.workspaceId === 'string' && body.workspaceId !== '' ? { workspaceId: body.workspaceId } : {},
    ...typeof body.fileId === 'string' && body.fileId !== '' ? { fileId: body.fileId } : {},
  })
  sendJson(res, 200, { sessionId: marker.sessionId })
}

async function baselineGetRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sessionId = url.searchParams.get('sessionId') ?? ''
  if (sessionId === '') throw new DeskError('BAD_BODY', '缺少 sessionId')
  const record = route.store.getNoteBaseline(sessionId)
  sendJson(res, 200, {
    baseline: record === undefined ? undefined : { body: record.body, at: record.at, fileId: record.fileId },
  })
}

async function baselineSaveRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {


  const body = bodyObject<NoteBaselineRequest>(await readJsonBody(req, NOTEBOOK_WRITE_BODY_BYTES), '请求体必须是对象')
  if (typeof body.sessionId !== 'string' || body.sessionId === '') throw new DeskError('BAD_BODY', '缺少 sessionId')
  if (typeof body.fileId !== 'string' || body.fileId === '') throw new DeskError('BAD_BODY', '缺少 fileId')
  if (typeof body.body !== 'string') throw new DeskError('BAD_BODY', 'body 必须是字符串')
  if (typeof body.at !== 'string' || body.at === '') throw new DeskError('BAD_BODY', '缺少 at')
  const file = route.store.getNoteFile(body.fileId)
  if (file === undefined) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)
  const saved = await route.store.saveNoteBaseline({
    rootPath: file.rootPath,
    sessionId: body.sessionId,
    fileId: file.id,
    body: body.body,
    at: body.at,
  })
  sendJson(res, 200, {
    baseline: saved === null ? undefined : { body: saved.body, at: saved.at, fileId: saved.fileId },
  })
}

async function draftGetRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const fileId = url.searchParams.get('fileId') ?? ''
  if (fileId === '') throw new DeskError('BAD_BODY', '缺少 fileId')
  sendJson(res, 200, { draft: notebookOf(route).draft(fileId) })
}

async function draftSaveRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {

  const body = bodyObject<NoteDraftRequest>(await readJsonBody(req, NOTEBOOK_WRITE_BODY_BYTES), '请求体必须是对象')
  if (typeof body.fileId !== 'string' || body.fileId === '') throw new DeskError('BAD_BODY', '缺少 fileId')
  if (!Array.isArray(body.drafts)) throw new DeskError('BAD_BODY', 'drafts 必须是数组')
  const file = route.store.getNoteFile(body.fileId)
  if (file === undefined) throw new DeskError('UNKNOWN_NOTE', '文件身份不存在', 404)
  const draft = await route.store.saveNoteDraft({
    rootPath: file.rootPath,
    path: file.path,
    fileId: file.id,
    drafts: body.drafts,
    ...typeof body.expectedRevision === 'number' && Number.isInteger(body.expectedRevision) && body.expectedRevision >= 0
      ? { expectedRevision: body.expectedRevision }
      : {},
  })

  sendJson(res, 200, { draft })
}

async function historyGetRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, await notebookOf(route).history())
}

async function historyRecordRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<RecordReviewRequest>(await readJsonBody(req, NOTEBOOK_WRITE_BODY_BYTES), '请求体必须是对象')
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
  { method: 'GET', path: ROUTES.notebookSearch, handle: searchRoute },
  { method: 'GET', path: ROUTES.notebookList, handle: listRoute },
  { method: 'POST', path: ROUTES.notebookFile, handle: fileRoute },
  { method: 'POST', path: ROUTES.notebookOpen, handle: openRoute },
  { method: 'GET', path: ROUTES.notebookOpenById, handle: openByIdRoute },
  { method: 'GET', path: ROUTES.notebookReviewSessions, handle: reviewSessionsGetRoute },
  { method: 'POST', path: ROUTES.notebookReviewSessions, handle: reviewSessionMarkRoute },
  { method: 'GET', path: ROUTES.notebookBaseline, handle: baselineGetRoute },
  { method: 'POST', path: ROUTES.notebookBaseline, handle: baselineSaveRoute },
  { method: 'GET', path: ROUTES.notebookDraft, handle: draftGetRoute },
  { method: 'POST', path: ROUTES.notebookDraft, handle: draftSaveRoute },
  { method: 'GET', path: ROUTES.notebookHistory, handle: historyGetRoute },
  { method: 'POST', path: ROUTES.notebookHistory, handle: historyRecordRoute },
  { method: 'DELETE', path: ROUTES.notebookHistory, handle: historyDeleteRoute },
]
