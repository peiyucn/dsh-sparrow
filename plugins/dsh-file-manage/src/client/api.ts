/** dsh-file-manage 客户端请求封装：host 路由的 fetch 层（超时 + 错误提取）。 @module dsh-file-manage/client/api */

import type { FileRow } from '../files.js'
import {
  COUNT_CACHE_TTL_MS,
  COUNT_TOTAL_TIMEOUT_MS,
  LIST_PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  ROUTES,
} from '../constants.js'

/** 总数统计（含配额，供网盘式进度条）。 */
export interface FileCountSummary {
  count: number
  totalBytes: number
  totalBytesLabel: string
  quotaBytes: number
  quotaBytesLabel: string
  quotaCount: number
}

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

/**
 * 总数统计的整体超时：host 侧整次扫描的预算 + 一个请求预算的余量，
 * 让 host 的 deadline 先触发（用户看到的是「服务端扫描超时」而不是客户端先断开）。
 */
const COUNT_TIMEOUT_MS = COUNT_TOTAL_TIMEOUT_MS + REQUEST_TIMEOUT_MS

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

/** 解析 JSON 响应体：失败返回 null（错误文案路径回退 HTTP 状态，成功路径必须显式报错）。 */
async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T
  } catch {
    return null
  }
}

/** 非 2xx 的用户可读错误：优先 payload.error.message，回退 HTTP 状态文案。 */
async function readErrorMessage(response: Response): Promise<string> {
  const payload = await readJson<{ error?: { message?: string } }>(response)
  return payload?.error?.message ?? `请求失败（HTTP ${response.status}）`
}

/** 2xx 但响应体不是 JSON（代理错误页 / 截断响应）：明确报错，不能当空列表。 */
async function readPayload<T>(response: Response): Promise<T> {
  const payload = await readJson<T>(response)
  if (payload === null) throw new Error('服务端返回了无法解析的响应')
  return payload
}

export async function listApi(after?: string): Promise<{ rows: FileRow[]; hasMore: boolean; lastId?: string }> {
  // 数据页大于渲染窗口（200 > 20），一次游标请求覆盖多次「加载更多」。
  const params = new URLSearchParams({ limit: String(LIST_PAGE_SIZE) })
  if (after !== undefined) params.set('after', after)
  const response = await fetchWithTimeout(`${ROUTES.list}?${params.toString()}`, {}, REQUEST_TIMEOUT_MS)
  if (!response.ok) throw new Error(await readErrorMessage(response))
  const payload = await readPayload<ListEnvelope>(response)
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
  const response = await fetchWithTimeout(ROUTES.count, {}, COUNT_TIMEOUT_MS)
  if (!response.ok) throw new Error(await readErrorMessage(response))
  const payload = await readPayload<Partial<FileCountSummary>>(response)
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
  const response = await fetchWithTimeout(`${ROUTES.files}?${params.toString()}`, { method: 'DELETE' }, REQUEST_TIMEOUT_MS)
  if (!response.ok) throw new Error(await readErrorMessage(response))
  // 删除落定后失效计数缓存：下一轮 count（含删除后的总数刷新）拿到包含本次删除的新数字。
  invalidateCountCache()
}
