

import { PREFIX } from '../../constants.js'
import type {
  ArchiveRequest, ArchiveTreeNode, DeleteMutationResponse, DeleteRequest, ListResponse, RestoreRequest, RestoreResponse,
  StraysResponse, TrashDeleteAllResponse, TrashDeleteRequest, TrashDeleteResponse, TrashDirResponse,
  TrashListResponse, TrashMutationResponse, TrashRequest, TrashRestoreAllResponse, UnarchiveRequest, UnarchiveResponse,
} from '../../session-admin.js'
import { fetchJson, postJson } from '../http.js'


const BASE = `${PREFIX}/sessions`

const ARCHIVE_READ_TIMEOUT_MS = 60_000
const ARCHIVE_MUTATION_TIMEOUT_MS = 120_000


function readArchive<T>(path: string): Promise<T> {
  return fetchJson<T>(`${BASE}${path}`, undefined, { timeoutMs: ARCHIVE_READ_TIMEOUT_MS })
}


function postArchive<T>(path: string, body: unknown): Promise<T> {
  return postJson<T>(`${BASE}${path}`, body, { timeoutMs: ARCHIVE_MUTATION_TIMEOUT_MS })
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
  list: () => readArchive<ListResponse>('/list').then(body => body.tree),
  strays: () => readArchive<StraysResponse>('/strays').then(body => body.items),
  trash: () => readArchive<TrashListResponse>('/trash').then(body => body.items),
  trashDir: () => readArchive<TrashDirResponse>('/trash-dir'),
  unarchive: sessionId => postArchive<UnarchiveResponse>('/unarchive', { sessionId } satisfies UnarchiveRequest).then(() => undefined),
  archive: sessionId => postArchive<{ ok: true }>('/archive', { sessionId } satisfies ArchiveRequest).then(() => undefined),
  moveToTrash: sessionId => postArchive<TrashMutationResponse>('/trash', { sessionId, confirm: true } satisfies TrashRequest),
  deleteSession: input => postArchive<DeleteMutationResponse>('/delete', input),
  restore: trashId => postArchive<RestoreResponse>('/restore', { trashId } satisfies RestoreRequest),
  restoreAll: () => postArchive<TrashRestoreAllResponse>('/trash-restore-all', { confirm: true }),
  deleteTrashEntry: trashId => postArchive<TrashDeleteResponse>('/trash-delete', { trashId, confirm: true } satisfies TrashDeleteRequest),
  deleteAllTrash: () => postArchive<TrashDeleteAllResponse>('/trash-delete-all', { confirm: true }),
}
