/** Notebook REST routes: handlers only; mounting and the trust fence live in host/router.ts. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_QUERY_CHARS, ROUTES } from '../../constants.js'
import type {
  AnnotationListResponse, AnnotationMutationResponse, CreateAnnotationRequest, DeleteAnnotationRequest,
  NotebookPageResponse, NotebookRootRequest, NotebookSearchResponse, NotebookStateResponse, ReanchorAnnotationRequest,
  ReplyAnnotationRequest, UpdateAnnotationRequest, DetectOrphansRequest,
} from '../../contract.js'
import { anchorStillValid } from './annotations.js'
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
    ...url.searchParams.get('missing') === '1' ? { missingFrontmatter: true } : {},
    ...url.searchParams.get('empty') === '1' ? { emptyBody: true } : {},
    ...Number.isInteger(rawLimit) && rawLimit > 0 ? { limit: rawLimit } : {},
  })
  sendJson(res, 200, result satisfies NotebookSearchResponse)
}

async function clearRootRoute(route: DeskRouteContext, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  await notebookOf(route).clearRoot()
  const state = await notebookOf(route).state()
  sendJson(res, 200, state satisfies NotebookStateResponse)
}

async function pageRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.searchParams.get('path') ?? ''
  if (path === '') throw new DeskError('BAD_BODY', '缺少笔记路径')
  const page = await notebookOf(route).page(path)
  sendJson(res, 200, page satisfies NotebookPageResponse)
}

/* ------------------------------ annotations ------------------------------ */

async function listAnnotationsRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.searchParams.get('path') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const annotations = route.store.listAnnotations({
    ...path === undefined || path === '' ? {} : { path },
    ...status === undefined || status === '' ? {} : { status },
  })
  sendJson(res, 200, { annotations } satisfies AnnotationListResponse)
}

async function addAnnotationRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<CreateAnnotationRequest>(await readJsonBody(req), '请求体必须是对象')
  const annotation = await route.store.createAnnotation(body)
  sendJson(res, 201, { annotation } satisfies AnnotationMutationResponse)
}

async function replyAnnotationRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<ReplyAnnotationRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少批注 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  const annotation = await route.store.replyAnnotation({
    id: body.id,
    expectedRevision: body.expectedRevision,
    body: body.body,
    author: body.author === 'ai' ? 'ai' : 'human',
  })
  sendJson(res, 200, { annotation } satisfies AnnotationMutationResponse)
}

async function updateAnnotationRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<UpdateAnnotationRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少批注 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  const rawPatch: unknown = body.patch
  if (typeof rawPatch !== 'object' || rawPatch === null || Array.isArray(rawPatch)) {
    throw new DeskError('BAD_BODY', '缺少 patch 对象')
  }
  const patch = rawPatch as { readonly status?: unknown }
  if (patch.status === undefined) throw new DeskError('BAD_BODY', 'patch 只接受 status')
  const annotation = await route.store.updateAnnotationStatus(body.id, body.expectedRevision, patch.status)
  sendJson(res, 200, { annotation } satisfies AnnotationMutationResponse)
}

async function deleteAnnotationRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<DeleteAnnotationRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少批注 id')
  await route.store.deleteAnnotation(body.id)
  sendJson(res, 200, { deleted: true })
}

async function reanchorAnnotationRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<ReanchorAnnotationRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少批注 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  const annotation = await route.store.updateAnnotationAnchor({
    id: body.id,
    expectedRevision: body.expectedRevision,
    anchor: body.anchor,
  })
  sendJson(res, 200, { annotation } satisfies AnnotationMutationResponse)
}

/**
 * Mark threads whose anchors no longer resolve. A missing page invalidates every thread on it
 * (the file was moved or deleted outside DSH), which is exactly the external-edit case.
 */
async function detectOrphansRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<DetectOrphansRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.path !== 'string' || body.path.trim() === '') throw new DeskError('BAD_BODY', '缺少笔记路径')
  const path = body.path.trim()
  let pageBody = ''
  let fields: readonly { readonly name: string; readonly value: string }[] = []
  try {
    const page = await notebookOf(route).page(path)
    pageBody = page.body
    fields = page.fields
  } catch {
    // Missing page → every anchor on it is stale; handled by the same loop below.
  }
  for (const thread of route.store.listAnnotations({ path })) {
    if (thread.status === 'resolved' || thread.status === 'orphaned') continue
    if (anchorStillValid(thread.anchor, pageBody, fields)) continue
    try {
      await route.store.updateAnnotationStatus(thread.id, thread.revision, 'orphaned')
    } catch {
      // A concurrent change wins; the next detect pass will settle it.
    }
  }
  sendJson(res, 200, { annotations: route.store.listAnnotations({ path }) } satisfies AnnotationListResponse)
}
export const NOTEBOOK_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.notebookState, handle: stateRoute },
  { method: 'POST', path: ROUTES.notebookRoot, handle: setRootRoute },
  { method: 'DELETE', path: ROUTES.notebookRoot, handle: clearRootRoute },
  { method: 'GET', path: ROUTES.notebookSearch, handle: searchRoute },
  { method: 'GET', path: ROUTES.notebookPage, handle: pageRoute },
  { method: 'GET', path: ROUTES.annotationList, handle: listAnnotationsRoute },
  { method: 'POST', path: ROUTES.annotationAdd, handle: addAnnotationRoute },
  { method: 'POST', path: ROUTES.annotationReply, handle: replyAnnotationRoute },
  { method: 'POST', path: ROUTES.annotationReanchor, handle: reanchorAnnotationRoute },
  { method: 'POST', path: ROUTES.annotationDetect, handle: detectOrphansRoute },
  { method: 'POST', path: ROUTES.annotationUpdate, handle: updateAnnotationRoute },
  { method: 'POST', path: ROUTES.annotationDelete, handle: deleteAnnotationRoute },
]
