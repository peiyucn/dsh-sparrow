/** Note REST routes: handlers only; mounting and the trust fence live in host/router.ts. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_QUERY_CHARS, ROUTES } from '../../constants.js'
import type {
  CreateNoteRequest, DeleteNoteRequest, NoteDeleteResponse, NoteListResponse, NoteMutationResponse,
  UpdateNoteRequest,
} from '../../contract.js'
import type { NotePatch } from '../../model.js'
import { DeskError, bodyObject, readJsonBody, sendJson } from '../http.js'
import type { DeskRouteContext, DeskRouteEntry } from '../router.js'

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

export const NOTE_ROUTES: readonly DeskRouteEntry[] = [
  { method: 'GET', path: ROUTES.notes, handle: listNotesRoute },
  { method: 'POST', path: ROUTES.notes, handle: createNoteRoute },
  { method: 'POST', path: ROUTES.noteUpdate, handle: updateNoteRoute },
  { method: 'POST', path: ROUTES.noteDelete, handle: deleteNoteRoute },
]
