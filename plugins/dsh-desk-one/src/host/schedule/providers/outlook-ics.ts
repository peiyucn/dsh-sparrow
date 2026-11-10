/**
 * Outlook personal calendar: published ICS link (read-only, no OAuth).
 *
 * The link is user-provided, so the host must be whitelisted and https-only before any request is
 * made. Conditional GET with `If-None-Match` keeps the 3–24h server refresh cheap; a 200 that
 * carries a login page / policy block is an auth failure, never parsed as iCalendar.
 */

import { SCHEDULE_REQUEST_TIMEOUT_MS } from '../../../constants.js'
import { ScheduleError } from '../types.js'

interface OutlookIcsFetchOptions {
  /** ETag from the previous pull; sent as `If-None-Match`. */
  etag?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface OutlookIcsFetchResult {
  ics?: string
  etag?: string
  notModified: boolean
}

const OUTLOOK_HOSTS = new Set(['outlook.live.com', 'outlook.office365.com', 'outlook.office.com'])

export async function fetchOutlookIcs(
  url: string,
  opts: OutlookIcsFetchOptions = {},
): Promise<OutlookIcsFetchResult> {
  const target = parseIcsUrl(url)
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new ScheduleError('UNSUPPORTED', '当前运行环境缺少 fetch，无法拉取 Outlook ICS')
  }

  const headers: Record<string, string> = { accept: 'text/calendar, text/plain; q=0.9, */*; q=0.1' }
  if (opts.etag !== undefined && opts.etag.trim() !== '') headers['if-none-match'] = opts.etag.trim()

  let response: Response
  try {
    response = await fetchImpl(target.href, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(resolveTimeout(opts.timeoutMs)),
    })
  } catch (error) {
    throw new ScheduleError('TRANSIENT', `Outlook ICS 请求失败：${describeNetworkError(error)}`)
  }

  if (response.status === 304) {
    // Keep a stable result shape (both keys present): tests and callers read `.ics` unconditionally.
    return { notModified: true, ics: undefined, etag: opts.etag }
  }
  if (!response.ok) throwForStatus(response.status)

  const contentType = response.headers.get('content-type') ?? ''
  let body: string
  try {
    body = await response.text()
  } catch (error) {
    throw new ScheduleError('TRANSIENT', `Outlook ICS 响应读取失败：${describeNetworkError(error)}`)
  }
  body = body.replace(/^\uFEFF/, '').trim()

  if (looksLikeHtml(contentType, body)) {
    throw new ScheduleError(
      'AUTH_EXPIRED',
      'Outlook ICS 链接返回登录页或被组织策略拦截，请在网页版重新发布日历',
      'SCHEDULE_AUTH_EXPIRED',
    )
  }
  if (!/BEGIN:VCALENDAR/i.test(body)) {
    throw new ScheduleError('UNSUPPORTED', 'Outlook ICS 链接返回内容不是 iCalendar')
  }

  const etag = response.headers.get('etag')
  return {
    notModified: false,
    ics: body,
    etag: etag === null || etag.trim() === '' ? undefined : etag.trim(),
  }
}

function parseIcsUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ScheduleError('UNSUPPORTED', 'Outlook ICS 链接不是合法 URL')
  }
  if (url.protocol !== 'https:') throw new ScheduleError('UNSUPPORTED', 'Outlook ICS 链接必须是 https')
  if (url.username !== '' || url.password !== '') throw new ScheduleError('UNSUPPORTED', 'Outlook ICS 链接不能内嵌凭据')
  if (!isAllowedOutlookHost(url.hostname)) {
    throw new ScheduleError('UNSUPPORTED', 'Outlook ICS 链接的主机不在白名单内')
  }
  return url
}

function isAllowedOutlookHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return OUTLOOK_HOSTS.has(host) || host.endsWith('.outlook.com')
}

function throwForStatus(status: number): never {
  // 403/404/410 all mean the published link was disabled or re-published: user action required.
  if (status === 401 || status === 403 || status === 404 || status === 410) {
    throw new ScheduleError(
      'AUTH_EXPIRED',
      `Outlook ICS 链接失效（HTTP ${status}），请在网页版重新发布日历`,
      'SCHEDULE_AUTH_EXPIRED',
    )
  }
  if (status === 429 || status >= 500) {
    throw new ScheduleError('TRANSIENT', `Outlook ICS 暂时不可用（HTTP ${status}），稍后重试`, 'SCHEDULE_TRANSIENT')
  }
  throw new ScheduleError('UNSUPPORTED', `Outlook ICS 请求失败（HTTP ${status}）`)
}

function looksLikeHtml(contentType: string, body: string): boolean {
  if (/text\/html/i.test(contentType)) return true
  return /^\s*<(?:!doctype\s+html|html)\b/i.test(body)
}

function resolveTimeout(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : SCHEDULE_REQUEST_TIMEOUT_MS
}

function describeNetworkError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return '请求超时或被中止'
  }
  return error instanceof Error ? error.message : String(error)
}
