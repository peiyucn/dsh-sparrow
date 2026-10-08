/** dsh-file-manage 纯逻辑：端点解析、分页参数、行格式化、上游错误分类。 @module dsh-file-manage/files */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { DeepSeekFileObject } from '@deepseek-ai/dsh-llm-deepseek'

/** 官方自动上传文件名的前缀（llm-deepseek file-store.ts 的 OWNED_FILE_PREFIX）。 */
export const DSH_OWNED_FILE_PREFIX = 'dsh-'

/** 列表页大小（官方上限 1000）。 */
export const PAGE_SIZE = 20

/** 总数统计每页拉取上限（官方 list 上限 1000）。 */
export const COUNT_PAGE_LIMIT = 1000

/** 总数统计最多翻页数：官方配额 10000 个文件 ÷ 每页 1000 = 10 页，12 页兜底防配额口径变化。 */
export const MAX_COUNT_PAGES = 12

export const COUNT_PAGE_TIMEOUT_MS = 15_000

/**
 * 交给官方 `DeepSeekFilesClient` 的 baseURL：只解析根、**不在这里拼 `/v1`** —— 官方 client
 * 构造时会自己归一化（路径不以 `/v1` 结尾就追加，再拼会得到 `/v1/v1/files`）；
 * 公共端点同样不硬编码，由调用方传官方导出的常量，官方改端点本插件自动跟随。
 */
export function resolveBaseURL(
  sectionBaseURL: string | undefined,
  envBaseURL: string | undefined,
  publicBaseURL: string,
): string {
  return sectionBaseURL ?? envBaseURL ?? publicBaseURL
}

/** 普通 API key 走的官方认证头名（官方 client 直接把它 set 进请求头）。 */
export const API_KEY_HEADER = 'x-api-key'

/**
 * 交给官方 `DeepSeekFilesClient` 的认证头。**rc.1 → rc.2 破坏性变更**：构造参数由 `apiKey`
 * 改成 `headers`，旧参数会被静默忽略（client 内部 `Object.entries(undefined)` 直接抛错）。
 */
export function authHeaders(apiKey: string): Record<string, string> {
  return { [API_KEY_HEADER]: apiKey }
}

/** 探针用的假 key／假端点：`.invalid` 是 RFC 2606 保留的不可解析 TLD。 */
const PROBE_API_KEY = 'dsh-file-manage-shape-probe'
const PROBE_BASE_URL = 'https://probe.invalid'
/** 探针自身的超时兜底：万一将来官方不再认 `fetch`，真实请求也必须自行了断。 */
const PROBE_TIMEOUT_MS = 2_000

/** 官方 client 的最小构造面（探针只用到这两项）。 */
export interface FilesClientConstructor {
  new (options: {
    baseURL: string
    headers: Readonly<Record<string, string>>
    fetch?: typeof fetch
  }): {
    list(options?: { limit?: number; signal?: AbortSignal }): Promise<unknown>
  }
}

/**
 * 探测官方 client 是否**认**我们的构造参数（`headers` + `fetch`）：不能只查导出符号 ——
 * rc.1 → rc.2 的破坏性变更恰好是「符号都在、参数换名」，只查存在性会让插件**带病启动**
 * （每次 list / delete 都在运行期失败）。这里注入假 fetch 跑一次**无网络**往返，断言 key 头真的被发了出去。
 */
export async function probeFilesClientShape(Client: FilesClientConstructor): Promise<boolean> {
  let sent: [string, string][] | undefined
  const stub = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent = [...new Headers(init?.headers).entries()]
    return new Response(JSON.stringify({ data: [], has_more: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const client = new Client({
      baseURL: PROBE_BASE_URL,
      headers: authHeaders(PROBE_API_KEY),
      fetch: stub as typeof fetch,
    })
    await client.list({ limit: 1, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  } catch {
    return false
  }
  return sent?.some(([name, value]) => name.toLowerCase() === API_KEY_HEADER && value === PROBE_API_KEY) === true
}

/** 归一化后的分页参数。 */
export interface PageQuery {
  after?: string
  limit: number
}

/**
 * 分页参数归一化：limit 钳到 [1, 1000]（非法回退 PAGE_SIZE）；空 after 省略；异常输入返回安全默认值，不抛。
 * 没有 `order`：官方 Files API 已无可用的排序查询（官方 client 的 `list()` 只接受 `after` / `limit` / `signal`，
 * 传了也不生效），排序改由调用方本地做。
 */
export function normalizePageQuery(query: { after?: string; limit?: string }): PageQuery {
  // 只接受纯数字串（Number('') === 0 会把空串误判为 0，需先拦）。
  const limitText = query.limit
  const limitRaw = limitText !== undefined && /^\d+$/u.test(limitText) ? Number(limitText) : Number.NaN
  const limit = Number.isInteger(limitRaw) ? Math.min(1000, Math.max(1, limitRaw)) : PAGE_SIZE
  const after = query.after !== undefined && query.after !== '' ? query.after : undefined
  return { ...after === undefined ? {} : { after }, limit }
}

/** 人读大小（二进制单位）：B / KiB / MiB / GiB；异常输入返回 '0 B'。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  let value = bytes
  for (const unit of ['KiB', 'MiB', 'GiB'] as const) {
    value /= 1024
    if (value < 1024 || unit === 'GiB') {
      return `${value >= 100 ? String(Math.round(value)) : value.toFixed(1)} ${unit}`
    }
  }
  return '0 B'
}

/** 时间戳（Unix 秒）→ 本地可读时间「YYYY-MM-DD HH:mm」；异常输入返回 '—'。 */
export function formatTimestamp(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds < 0) return '—'
  const date = new Date(unixSeconds * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 面板文件行（bytes 为原始字节数，供面板删除后本地校正）。 */
export interface FileRow {
  id: string
  filename: string
  bytes: number
  sizeLabel: string
  createdAtLabel: string
  expiresAtLabel?: string
  dshOwned: boolean
}

/** 官方文件对象 → 面板行（格式化与 dsh- 判定集中在此，可单测）。 */
export function toFileRow(file: DeepSeekFileObject): FileRow {
  return {
    id: file.id,
    filename: file.filename,
    bytes: file.bytes,
    sizeLabel: formatBytes(file.bytes),
    createdAtLabel: formatTimestamp(file.createdAt),
    ...file.expiresAt === undefined ? {} : { expiresAtLabel: formatTimestamp(file.expiresAt) },
    dshOwned: file.filename.startsWith(DSH_OWNED_FILE_PREFIX),
  }
}

/** 解码 DELETE 的文件 id 参数：畸形百分号编码返回空串（交由 400 分支），不抛 URIError。 */
export function decodeFileIdParam(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return ''
  }
}

/** 上游错误 → 面板可见的分类；未知错误归为 502。 */
export interface UpstreamErrorInfo {
  code: string
  status: number
  message: string
}

/** 官方 Files 客户端错误（DeepSeekFilesError 继承 LlmError，共享 code 分类）→ HTTP 状态与用户可读文案。 */
export function classifyUpstreamError(error: unknown): UpstreamErrorInfo {
  if (error instanceof LlmError) {
    switch (error.code) {
      case 'AUTH': return { code: 'AUTH', status: 401, message: '鉴权失败：DeepSeek API key 无效或已失效' }
      case 'RATE_LIMIT': return { code: 'RATE_LIMIT', status: 429, message: '触发 DeepSeek 限流，请稍后重试' }
      case 'SERVER': return { code: 'SERVER', status: 502, message: 'DeepSeek 服务端错误，请稍后重试' }
      case 'FILES_API': return { code: 'FILES_API', status: 400, message: error.message }
      default: return { code: 'UPSTREAM', status: 502, message: '上游请求失败，请稍后重试' }
    }
  }
  return { code: 'UPSTREAM', status: 502, message: '上游请求失败，请稍后重试' }
}
