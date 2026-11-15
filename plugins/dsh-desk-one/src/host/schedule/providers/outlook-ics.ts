/**
 * ICS fetching for the schedule sources: the historical Outlook published-link channel and the
 * provider-agnostic public ICS subscription channel.
 *
 * Links are user-provided, so each channel has its own host policy:
 * - `outlook`: only the documented Microsoft hosts (the published-link channel is Microsoft-only);
 * - `public`: any https host except loopback / private / link-local destinations (a pasted link may
 *   point into the local network, and the host must not become an SSRF proxy). Redirects are
 *   followed by hand so every hop is checked against the same policy — with fetch's automatic
 *   following a public feed could bounce the host to `http://127.0.0.1/…` unchecked.
 *
 * Conditional GET with `If-None-Match` keeps the 3–24h server refresh cheap; a 200 that carries a
 * login page / policy block is an auth failure, never parsed as iCalendar.
 */

import { isIP } from 'node:net'
import { SCHEDULE_REQUEST_TIMEOUT_MS } from '../../../constants.js'
import { ScheduleError } from '../types.js'

/** Host policy of one ICS link: the Outlook whitelist, or the generic public-subscription rule. */
export type IcsHostPolicy = 'outlook' | 'public'

interface OutlookIcsFetchOptions {
  /** ETag from the previous pull; sent as `If-None-Match`. */
  etag?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Host allow rule; defaults to the Outlook whitelist. */
  hostPolicy?: IcsHostPolicy
}

interface OutlookIcsFetchResult {
  ics?: string
  etag?: string
  notModified: boolean
}

const OUTLOOK_HOSTS = new Set(['outlook.live.com', 'outlook.office365.com', 'outlook.office.com'])
const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** User-facing channel name; the messages of the two channels must not claim to be the other one. */
function channelLabel(policy: IcsHostPolicy): string {
  return policy === 'outlook' ? 'Outlook ICS' : '订阅'
}

export async function fetchOutlookIcs(
  url: string,
  opts: OutlookIcsFetchOptions = {},
): Promise<OutlookIcsFetchResult> {
  const policy = opts.hostPolicy ?? 'outlook'
  const label = channelLabel(policy)
  const target = parseIcsUrl(url, policy)
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new ScheduleError('UNSUPPORTED', `当前运行环境缺少 fetch，无法拉取 ${label} 链接`)
  }

  const headers: Record<string, string> = { accept: 'text/calendar, text/plain; q=0.9, */*; q=0.1' }
  if (opts.etag !== undefined && opts.etag.trim() !== '') headers['if-none-match'] = opts.etag.trim()

  const timeoutMs = resolveTimeout(opts.timeoutMs)
  let response: Response
  try {
    // The Outlook channel keeps fetch's automatic redirects (a Microsoft-owned host only redirects
    // inside its own surface); the public channel validates every hop itself.
    response = policy === 'outlook'
      ? await fetchImpl(target.href, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) })
      : await fetchPublicIcs(target, headers, fetchImpl, timeoutMs)
  } catch (error) {
    if (error instanceof ScheduleError) throw error
    throw new ScheduleError('TRANSIENT', `${label} 请求失败：${describeNetworkError(error)}`)
  }

  if (response.status === 304) {
    // Keep a stable result shape (both keys present): tests and callers read `.ics` unconditionally.
    return { notModified: true, ics: undefined, etag: opts.etag }
  }
  if (!response.ok) throwForStatus(response.status, label)

  const contentType = response.headers.get('content-type') ?? ''
  let body: string
  try {
    body = await response.text()
  } catch (error) {
    throw new ScheduleError('TRANSIENT', `${label} 响应读取失败：${describeNetworkError(error)}`)
  }
  body = body.replace(/^\uFEFF/, '').trim()

  if (looksLikeHtml(contentType, body)) {
    throw new ScheduleError(
      'AUTH_EXPIRED',
      policy === 'outlook'
        ? 'Outlook ICS 链接返回登录页或被组织策略拦截，请在网页版重新发布日历'
        : '订阅链接返回登录页或被拦截，请重新获取订阅链接',
      'SCHEDULE_AUTH_EXPIRED',
    )
  }
  if (!/BEGIN:VCALENDAR/i.test(body)) {
    throw new ScheduleError('UNSUPPORTED', `${label} 链接返回内容不是 iCalendar`)
  }

  const etag = response.headers.get('etag')
  return {
    notModified: false,
    ics: body,
    etag: etag === null || etag.trim() === '' ? undefined : etag.trim(),
  }
}

/**
 * One GET with manual redirect following for the public-subscription policy: every hop must pass
 * `parseIcsUrl(…, 'public')` before the request is made, so a redirect cannot reach an internal
 * address. The single timeout signal bounds the whole chain.
 */
async function fetchPublicIcs(
  target: URL,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs)
  let current = target
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchImpl(current.href, { method: 'GET', headers, redirect: 'manual', signal })
    if (!REDIRECT_STATUSES.has(response.status)) return response
    const location = response.headers.get('location')
    await discardBody(response)
    if (location === null || location === '') {
      throw new ScheduleError('UNSUPPORTED', '订阅链接返回重定向但没有 Location 头')
    }
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      throw new ScheduleError('UNSUPPORTED', '订阅链接的重定向地址不是合法 URL')
    }
    current = parseIcsUrl(next.href, 'public')
  }
  throw new ScheduleError('UNSUPPORTED', '订阅链接重定向次数过多')
}

/** Release the redirect response body so the socket can be reused; already-consumed bodies are fine. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Nothing to release.
  }
}

function parseIcsUrl(raw: string, policy: IcsHostPolicy): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ScheduleError('UNSUPPORTED', `${channelLabel(policy)}链接不是合法 URL`)
  }
  if (url.protocol !== 'https:') {
    throw new ScheduleError('UNSUPPORTED', `${channelLabel(policy)}链接必须是 https`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new ScheduleError('UNSUPPORTED', `${channelLabel(policy)}链接不能内嵌凭据`)
  }
  if (policy === 'outlook') {
    if (!isAllowedOutlookHost(url.hostname)) {
      throw new ScheduleError('UNSUPPORTED', 'Outlook ICS 链接的主机不在白名单内')
    }
    return url
  }
  if (!isPublicIcsHost(url.hostname)) {
    throw new ScheduleError('UNSUPPORTED', '订阅链接必须指向公网地址（不能是 localhost 或内网 IP）')
  }
  return url
}

function isAllowedOutlookHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return OUTLOOK_HOSTS.has(host) || host.endsWith('.outlook.com')
}

/**
 * Whether a host may be fetched by the public-subscription policy: literal loopback / private /
 * link-local / CGNAT addresses, their IPv6 counterparts and the usual local name suffixes are
 * rejected; everything else is allowed (the link itself is the user's choice).
 *
 * This is a name/literal check, not a resolver pin: a hostname that resolves to an internal address
 * is not detected (the same level as the trust boundary around a user-pasted link).
 */
function isPublicIcsHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  const family = isIP(bare)
  if (family === 4) return !isPrivateIPv4(bare)
  if (family === 6) return !isPrivateIPv6(bare)
  return !(host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.home.arpa'))
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [first = 0, second = 0] = parts
  // Loopback, private, link-local, CGNAT, "this network", multicast and reserved space.
  if (first === 0 || first === 10 || first === 127) return true
  if (first === 169 && second === 254) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  if (first === 100 && second >= 64 && second <= 127) return true
  if (first >= 224) return true
  return false
}

function isPrivateIPv6(host: string): boolean {
  const value = host.toLowerCase()
  if (value === '::' || value === '::1') return true
  if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true
  // IPv4-mapped addresses (::ffff:127.0.0.1) must follow the IPv4 rule.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(value)
  if (mapped !== null) return isPrivateIPv4(mapped[1] ?? '')
  return false
}

function throwForStatus(status: number, label: string): never {
  // 403/404/410 all mean the feed was disabled or re-published: user action required.
  if (status === 401 || status === 403 || status === 404 || status === 410) {
    throw new ScheduleError(
      'AUTH_EXPIRED',
      label === 'Outlook ICS'
        ? `Outlook ICS 链接失效（HTTP ${status}），请在网页版重新发布日历`
        : `订阅链接失效（HTTP ${status}），请重新获取订阅链接`,
      'SCHEDULE_AUTH_EXPIRED',
    )
  }
  if (status === 429 || status >= 500) {
    throw new ScheduleError('TRANSIENT', `${label} 暂时不可用（HTTP ${status}），稍后重试`, 'SCHEDULE_TRANSIENT')
  }
  throw new ScheduleError('UNSUPPORTED', `${label} 请求失败（HTTP ${status}）`)
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
