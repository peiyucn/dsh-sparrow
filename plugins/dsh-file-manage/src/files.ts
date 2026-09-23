/** dsh-file-manage 纯逻辑：端点解析、分页参数、行格式化、上游错误分类。 @module dsh-file-manage/files */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { DeepSeekFileObject } from '@deepseek-ai/dsh-llm-deepseek'

/** 官方自动上传文件名的前缀（llm-deepseek file-store.ts 的 OWNED_FILE_PREFIX）。 */
export const DSH_OWNED_FILE_PREFIX = 'dsh-'

/** 列表页大小（owner 拍板 2026-09-01；官方上限 1000）。 */
export const PAGE_SIZE = 20

/** 总数统计每页拉取上限（官方 list 上限 1000）。 */
export const COUNT_PAGE_LIMIT = 1000

/** 总数统计最多翻页数：官方配额 10000 个文件 ÷ 每页 1000 = 10 页，12 页兜底防配额口径变化。 */
export const MAX_COUNT_PAGES = 12

/** 总数统计每页请求超时。 */
export const COUNT_PAGE_TIMEOUT_MS = 15_000

/**
 * 交给官方 `DeepSeekFilesClient` 的 baseURL。
 *
 * 只解析根、**不在这里拼 `/v1`**：官方 client 构造时自己归一化——路径不以 `/v1`
 * 结尾就追加（rc.1 `packages/llm/llm-deepseek/src/messages-api.ts:11-14`），
 * 我方再拼会得到 `/v1/v1/files`。公共端点同样不硬编码：rc.1 起官方
 * `PUBLIC_BASE_URL` 由 `https://api.deepseek.com` 改为 `https://api.deepseek.com/anthropic`
 * （`config.ts:115`），由调用方传官方导出的常量，官方再改端点本插件自动跟随。
 * @param sectionBaseURL - `llm-deepseek` 设置节里的 baseURL（未配置时为 undefined）。
 * @param envBaseURL - `$DEEPSEEK_BASE_URL`（未设置为 undefined）。
 * @param publicBaseURL - 官方导出的公共 API 根。
 * @returns 交给官方 client 的 baseURL（不含 `/v1`）。
 */
export function resolveBaseURL(
  sectionBaseURL: string | undefined,
  envBaseURL: string | undefined,
  publicBaseURL: string,
): string {
  return sectionBaseURL ?? envBaseURL ?? publicBaseURL
}

/** 归一化后的分页参数。 */
export interface PageQuery {
  after?: string
  limit: number
}

/**
 * 分页参数归一化：limit 钳到 [1, 1000]（非法回退 PAGE_SIZE）；空 after 省略。
 * 异常输入返回安全默认值，不抛。
 *
 * 不再有 `order`：官方 Files API 已无可用的排序查询——rc.1 官方 client 的 `list()`
 * 只接受 `after` / `limit` / `signal`（`files-api.ts:215-219`），官方自己的
 * `reclaimOldestOwned` 也改成「翻完所有页再按 createdAt 本地排序」并注明
 * “The API offers no ascending-order query”（`file-store.ts:318`）。传了也不生效。
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
