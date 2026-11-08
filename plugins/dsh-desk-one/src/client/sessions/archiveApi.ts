/** Browser-side session archive data plane: host session routes only. */

import { REQUEST_TIMEOUT_MS } from '../../constants.js'
import type {
  ArchiveRequest, ArchiveTreeNode, DeleteMutationResponse, DeleteRequest, ListResponse, RestoreRequest, RestoreResponse,
  StraysResponse, TrashDeleteAllResponse, TrashDeleteRequest, TrashDeleteResponse, TrashDirResponse, TrashEntry,
  TrashListResponse, TrashMutationResponse, TrashRequest, TrashRestoreAllResponse, UnarchiveRequest, UnarchiveResponse,
} from '../../host/sessions/contract.js'

const BASE = '/api/desk-one/sessions'

interface ApiErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()
  let payload: T & ApiErrorBody
  try {
    payload = JSON.parse(text) as T & ApiErrorBody
  } catch {
    throw new Error(`请求失败（HTTP ${response.status}）：${text.slice(0, 160) || '响应不是 JSON'}`)
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  return payload
}

function post<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface SessionsArchiveApi {
  readonly list: () => Promise<readonly ArchiveTreeNode[]>
  readonly strays: () => Promise<StraysResponse['items']>
  readonly trash: () => Promise<TrashListResponse['items']>
  readonly trashDir: () => Promise<TrashDirResponse>
  readonly unarchive: (sessionId: string) => Promise<void>
  readonly archive: (sessionId: string) => Promise<void>
  readonly moveToTrash: (sessionId: string) => Promise<TrashMutationResponse>
  readonly deleteSession: (input: DeleteRequest) => Promise<DeleteMutationResponse>
  readonly restore: (trashId: string) => Promise<RestoreResponse>
  readonly restoreAll: () => Promise<TrashRestoreAllResponse>
  readonly deleteTrashEntry: (trashId: string) => Promise<TrashDeleteResponse>
  readonly deleteAllTrash: () => Promise<TrashDeleteAllResponse>
}

export const sessionsArchiveApi: SessionsArchiveApi = {
  list: () => requestJson<ListResponse>('/list').then(body => body.tree),
  strays: () => requestJson<StraysResponse>('/strays').then(body => body.items),
  trash: () => requestJson<TrashListResponse>('/trash').then(body => body.items),
  trashDir: () => requestJson<TrashDirResponse>('/trash-dir'),
  unarchive: sessionId => post<UnarchiveResponse>('/unarchive', { sessionId } satisfies UnarchiveRequest).then(() => undefined),
  archive: sessionId => post<{ ok: true }>('/archive', { sessionId } satisfies ArchiveRequest).then(() => undefined),
  moveToTrash: sessionId => post<TrashMutationResponse>('/trash', { sessionId } satisfies TrashRequest),
  deleteSession: input => post<DeleteMutationResponse>('/delete', input),
  restore: trashId => post<RestoreResponse>('/restore', { trashId } satisfies RestoreRequest),
  restoreAll: () => post<TrashRestoreAllResponse>('/trash-restore-all', { confirm: true }),
  deleteTrashEntry: trashId => post<TrashDeleteResponse>('/trash-delete', { trashId, confirm: true } satisfies TrashDeleteRequest),
  deleteAllTrash: () => post<TrashDeleteAllResponse>('/trash-delete-all', { confirm: true }),
}

export type { TrashEntry }
