/** dsh-file-session 客户端请求封装：host 路由的 fetch 层（超时 + 错误提取）。 @module dsh-file-session/client/api */

import type { FileRow } from '../files.js'

/** 总数统计（含配额，供网盘式进度条）。 */
export interface FileCountSummary {
  count: number
  totalBytes: number
  totalBytesLabel: string
  quotaBytes: number
  quotaBytesLabel: string
  quotaCount: number
}

interface ListEnvelope {
  readonly items?: FileRow[]
  readonly hasMore?: boolean
  readonly lastId?: string
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** 面板请求超时：host 挂起时不让面板永久 loading（根 AGENTS 网络约定）。 */
const REQUEST_TIMEOUT_MS = 15_000
/** 总数统计超时：host 侧要游标翻到底（配额内最多 10 页），放宽到 60s。 */
const COUNT_TIMEOUT_MS = 60_000

export async function listApi(after?: string): Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }> {
  // limit 不传：host 归一化缺省回退 PAGE_SIZE（页大小只活在一处，避免两端漂移）。
  const params = new URLSearchParams()
  if (after !== undefined) params.set('after', after)
  const response = await fetch(`/api/file-session/list?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json() as ListEnvelope
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return {
    rows: payload.items ?? [],
    hasMore: payload.hasMore ?? false,
    ...payload.lastId === undefined ? {} : { lastId: payload.lastId },
  }
}

export async function countApi(): Promise<FileCountSummary> {
  const response = await fetch('/api/file-session/count', { signal: AbortSignal.timeout(COUNT_TIMEOUT_MS) })
  const payload = await response.json() as Partial<FileCountSummary> & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return {
    count: payload.count ?? 0,
    totalBytes: payload.totalBytes ?? 0,
    totalBytesLabel: payload.totalBytesLabel ?? '0 B',
    quotaBytes: payload.quotaBytes ?? 0,
    quotaBytesLabel: payload.quotaBytesLabel ?? '0 B',
    quotaCount: payload.quotaCount ?? 0,
  }
}

export async function deleteApi(id: string): Promise<void> {
  const params = new URLSearchParams({ id })
  const response = await fetch(`/api/file-session/files?${params.toString()}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json() as { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
}
