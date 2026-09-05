/** dsh-file-manage 客户端请求封装：host 路由的 fetch 层（超时 + 错误提取）。 @module dsh-file-manage/client/api */

import type { FileRow } from '../files.js'
import { FILE_PAGE_SIZE } from './paging.js'

/** 总数统计（含配额，供网盘式进度条）。 */
export interface FileCountSummary {
  count: number
  totalBytes: number
  totalBytesLabel: string
  quotaBytes: number
  quotaBytesLabel: string
  quotaCount: number
}

/** 总数统计 TTL 缓存时长：面板快速重开/重试不重复 count 全量翻页（count 要翻到底，配额内最多 10 页）。 */
export const COUNT_CACHE_TTL_MS = 30_000

/** TTL 缓存条目（api.ts 模块级单例：面板单实例，随 client bundle 生命周期，有界一条）。 */
export interface CountCacheEntry {
  readonly value: FileCountSummary
  readonly expiresAt: number
}

let countCache: CountCacheEntry | null = null

/** TTL 读缓存（时钟注入的纯逻辑，供单测）：未过期返回快照，过期或缺条返回 null。 */
export function readCountCache(entry: CountCacheEntry | null, nowMs: number): FileCountSummary | null {
  return entry !== null && nowMs < entry.expiresAt ? entry.value : null
}

/** 删除成功后失效计数缓存：下一次 count 拉取重新翻页，包含删除结果。 */
export function invalidateCountCache(): void {
  countCache = null
}

interface ListEnvelope {
  readonly items?: FileRow[]
  readonly hasMore?: boolean
  readonly lastId?: string
}

/** 面板请求超时：host 挂起时不让面板永久 loading（根 AGENTS 网络约定）。 */
const REQUEST_TIMEOUT_MS = 15_000
/** 总数统计超时：host 侧要游标翻到底（配额内最多 10 页），放宽到 60s。 */
const COUNT_TIMEOUT_MS = 60_000

/** 带超时的 fetch：超时中止转换为用户可读文案（浏览器原生 AbortError 文案不友好）。 */
async function fetchWithTimeout(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(path, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s），请重试`)
    }
    throw error
  }
}

/** 解析 JSON 响应体：非 JSON 回退空对象（代理错误页等异常输入返回安全默认值，不抛）。 */
async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T
  } catch {
    return {} as T
  }
}

/** 非 2xx 的用户可读错误：优先 payload.error.message，回退 HTTP 状态文案。 */
async function readErrorMessage(response: Response): Promise<string> {
  const payload = await readJson<{ error?: { message?: string } }>(response)
  return payload.error?.message ?? `请求失败（HTTP ${response.status}）`
}

export async function listApi(after?: string): Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }> {
  // limit 固定 FILE_PAGE_SIZE：数据页大于渲染窗口，窗口才真正裁剪 DOM（见 paging.ts）。
  const params = new URLSearchParams({ limit: String(FILE_PAGE_SIZE) })
  if (after !== undefined) params.set('after', after)
  const response = await fetchWithTimeout(`/api/file-manage/list?${params.toString()}`, {}, REQUEST_TIMEOUT_MS)
  if (!response.ok) throw new Error(await readErrorMessage(response))
  const payload = await readJson<ListEnvelope>(response)
  return {
    rows: payload.items ?? [],
    hasMore: payload.hasMore ?? false,
    ...payload.lastId === undefined ? {} : { lastId: payload.lastId },
  }
}

export async function countApi(): Promise<FileCountSummary> {
  // TTL 缓存：count 是「翻到底」的全量扫描（最多 10 页），面板每次打开都重扫太贵；
  // 命中缓存直接返回快照，过期才重扫（删除成功后由 deleteApi 失效）。
  const cached = readCountCache(countCache, Date.now())
  if (cached !== null) return cached
  const response = await fetchWithTimeout('/api/file-manage/count', {}, COUNT_TIMEOUT_MS)
  if (!response.ok) throw new Error(await readErrorMessage(response))
  const payload = await readJson<Partial<FileCountSummary>>(response)
  const summary: FileCountSummary = {
    count: payload.count ?? 0,
    totalBytes: payload.totalBytes ?? 0,
    totalBytesLabel: payload.totalBytesLabel ?? '0 B',
    quotaBytes: payload.quotaBytes ?? 0,
    quotaBytesLabel: payload.quotaBytesLabel ?? '0 B',
    quotaCount: payload.quotaCount ?? 0,
  }
  countCache = { value: summary, expiresAt: Date.now() + COUNT_CACHE_TTL_MS }
  return summary
}

export async function deleteApi(id: string): Promise<void> {
  const params = new URLSearchParams({ id })
  const response = await fetchWithTimeout(`/api/file-manage/files?${params.toString()}`, { method: 'DELETE' }, REQUEST_TIMEOUT_MS)
  if (!response.ok) throw new Error(await readErrorMessage(response))
  // 删除落定后失效计数缓存：下一轮 count（含删除后的总数刷新）拿到包含本次删除的新数字。
  invalidateCountCache()
}
