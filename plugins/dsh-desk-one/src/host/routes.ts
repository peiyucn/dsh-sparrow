/**
 * 4 条 REST 路由：信任栅栏 → 表驱动匹配 → 请求层校验 → 模型层执行 → 统一错误收口。
 * 后续任务 / 日程按同一模式在此追加路由，不改已有路径。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { MAX_QUERY_CHARS, ROUTES } from '../constants.js'
import type {
  CreateNoteRequest, DeleteNoteRequest, NoteDeleteResponse, NoteListResponse, NoteMutationResponse,
  UpdateNoteRequest,
} from '../contract.js'
import { DeskModelError, type NotePatch } from '../model.js'
import { isTrustedPluginRequest, officialTrustedHosts } from '../trust.js'
import { DeskError, bodyObject, readJsonBody, sendError, sendJson } from './http.js'
import type { DeskStore } from './store.js'

/** 一次请求可用的 host 装配件。 */
export interface DeskRouteContext {
  readonly ctx: Context
  readonly store: DeskStore
}

type RouteHandler = (route: DeskRouteContext, req: IncomingMessage, res: ServerResponse) => Promise<void>

/** 组装前缀 handler：栅栏 → 精确匹配 → 处理；所有异常按 sendError 收口。 */
export function createDeskRequestHandler(route: DeskRouteContext): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    try {
      // 信任栅栏先于一切路由（含只读）：本插件前缀比官方 `/api` 长，官方栅栏不会执行。
      if (!isTrustedPluginRequest(req.headers, officialTrustedHosts(route.ctx))) {
        sendError(route.ctx, res, new DeskError('FORBIDDEN', '拒绝非本机同源的请求', 403))
        return
      }
      const match = ROUTE_TABLE.find(entry => entry.method === req.method && entry.path === pathname)
      if (match === undefined) {
        sendJson(res, 404, { error: { code: 'BAD_BODY', message: `未知的 desk-one 路由：${pathname}` } })
        return
      }
      await match.handle(route, req, res)
    } catch (error) {
      sendError(route.ctx, res, error)
    }
  }
}

async function listNotesRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY_CHARS)
  sendJson(res, 200, { notes: route.store.listNotes(query) } satisfies NoteListResponse)
}

async function createNoteRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<CreateNoteRequest>(await readJsonBody(req), '请求体必须是对象')
  const note = await route.store.createNote(body)
  sendJson(res, 201, { note } satisfies NoteMutationResponse)
}

async function updateNoteRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<UpdateNoteRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少便签 id')
  if (!Number.isInteger(body.expectedRevision)) throw new DeskError('BAD_BODY', '缺少 expectedRevision')
  const rawPatch: unknown = body.patch
  if (typeof rawPatch !== 'object' || rawPatch === null || Array.isArray(rawPatch)) {
    throw new DeskError('BAD_BODY', '缺少 patch 对象')
  }
  const note = await route.store.updateNote(body.id, body.expectedRevision, rawPatch as NotePatch)
  sendJson(res, 200, { note } satisfies NoteMutationResponse)
}

async function deleteNoteRoute(route: DeskRouteContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = bodyObject<DeleteNoteRequest>(await readJsonBody(req), '请求体必须是对象')
  if (typeof body.id !== 'string' || body.id.trim() === '') throw new DeskError('BAD_BODY', '缺少便签 id')
  await route.store.deleteNote(body.id)
  sendJson(res, 200, { deleted: true } satisfies NoteDeleteResponse)
}

const ROUTE_TABLE: readonly { readonly method: string; readonly path: string; readonly handle: RouteHandler }[] = [
  { method: 'GET', path: ROUTES.notes, handle: listNotesRoute },
  { method: 'POST', path: ROUTES.notes, handle: createNoteRoute },
  { method: 'POST', path: ROUTES.noteUpdate, handle: updateNoteRoute },
  { method: 'POST', path: ROUTES.noteDelete, handle: deleteNoteRoute },
]

/** 路由所需的模型错误类型在 http.ts 里统一映射，这里导出一次便于测试引用。 */
export { DeskModelError }
