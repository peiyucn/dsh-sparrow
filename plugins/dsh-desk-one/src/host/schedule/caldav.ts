/**
 * Minimal CalDAV client for the two read-only CalDAV sources.
 *
 * Only the three request shapes the sync needs are implemented: discover the principal + calendar
 * home via `/.well-known/caldav`, list calendars under the home, and query VEVENTs in a time
 * window. Redirects are followed by hand (301/302/307/308, method and body preserved) so a
 * discovery redirect cannot silently turn the PROPFIND into a GET, and so the Basic credential is
 * never forwarded to a host outside the same host / iCloud shard family.
 */

import { SCHEDULE_REQUEST_TIMEOUT_MS } from '../../constants.js'
import { ScheduleError } from './types.js'
import type { PullWindow, RemoteCalendar } from './types.js'
import { parseMultistatus } from './xml.js'
import type { ParsedResponse } from './xml.js'

export interface CalDavAuth {
  user: string
  password: string
}

export interface CalDavDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Overrides the provider inferred from the home URL host (self-hosted CalDAV / tests). */
  provider?: RemoteCalendar['provider']
}

export interface CalDavDiscovery {
  principalUrl: string
  homeUrl: string
}

export interface CalDavEventResource {
  href: string
  etag?: string
  ics: string
}

const WELL_KNOWN_PATH = '/.well-known/caldav'
/** Documented WeCom fallback home (spec 05 §5 marks the discovery chain as unverified). */
const WECOM_HOME_FALLBACK_PATH = '/calendar/'
const MAX_REDIRECTS = 5
/** WeCom serves one .ics per GET; a small worker pool keeps a large calendar's sync bounded. */
const EVENT_FETCH_CONCURRENCY = 6
const REDIRECT_STATUSES = new Set([301, 302, 307, 308])

const PRINCIPAL_PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>`

const HOME_PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:calendar-home-set/>
  </d:prop>
</d:propfind>`

const LIST_CALENDARS_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <d:sync-token/>
  </d:prop>
</d:propfind>`

/** `Calendar-data` is requested bare on purpose: a nested comp filter makes iCloud return empty. */
function buildCalendarQueryBody(window: PullWindow): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${formatCalDavTime(window.startUtc, '开始')}" end="${formatCalDavTime(window.endUtc, '结束')}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`
}

interface HttpText {
  /** URL after redirects; relative hrefs are resolved against it. */
  url: string
  status: number
  contentType: string
  body: string
}

interface CalDavRequestInit {
  method: string
  headers: Record<string, string>
  body?: string
}

/** Discover the principal and the calendar home URL. */
export async function discoverCalDav(
  baseUrl: string,
  auth: CalDavAuth,
  deps: CalDavDeps = {},
): Promise<CalDavDiscovery> {
  const base = parseHttpUrl(baseUrl, 'CalDAV 地址')
  const origin = new URL(base.origin)
  const principalUrl = await discoverPrincipal(origin, auth, deps)
  const homeUrl = principalUrl === null ? null : await findCalendarHome(principalUrl, auth, deps)
  if (principalUrl !== null && homeUrl !== null) return { principalUrl, homeUrl }
  if (isWecomHost(origin.hostname)) {
    return { principalUrl: origin.href, homeUrl: new URL(WECOM_HOME_FALLBACK_PATH, origin).href }
  }
  throw new ScheduleError('UNSUPPORTED', 'CalDAV 发现失败：未找到当前账号的日历家目录')
}

/** List the calendars under a home URL; `remoteId` is the absolute calendar URL used for queries. */
export async function listCalDavCalendars(
  homeUrl: string,
  auth: CalDavAuth,
  deps: CalDavDeps = {},
): Promise<RemoteCalendar[]> {
  const home = parseHttpUrl(homeUrl, 'CalDAV 家目录')
  const provider = deps.provider ?? inferProvider(home)
  const response = await requestPropfind(home, '1', LIST_CALENDARS_BODY, auth, deps)
  ensureSuccess(response, 'CalDAV 列日历')
  const responses = parseWebDavBody(response, 'CalDAV 列日历')

  const calendars: RemoteCalendar[] = []
  for (const item of responses) {
    if (item.href === '') continue
    const url = resolveHref(item.href, response.url)
    if (url === null) continue
    if (!hasCalendarResourceType(item.props.resourcetype)) continue
    const displayName = (item.props.displayname ?? '').trim()
    calendars.push({
      provider,
      remoteId: url.href,
      displayName: displayName === '' ? lastPathSegment(url.pathname) : displayName,
      order: calendars.length,
    })
  }
  return calendars
}

/** Query the VEVENT resources of one calendar inside the window. */
export async function queryCalDavEvents(
  calendarUrl: string,
  window: PullWindow,
  auth: CalDavAuth,
  deps: CalDavDeps = {},
): Promise<CalDavEventResource[]> {
  const calendar = parseHttpUrl(calendarUrl, 'CalDAV 日历地址')
  const response = await requestText(calendar, {
    method: 'REPORT',
    headers: { depth: '1', 'content-type': 'application/xml; charset=utf-8' },
    body: buildCalendarQueryBody(window),
  }, auth, deps)
  ensureSuccess(response, 'CalDAV 查询事件')
  const resources = parseWebDavBody(response, 'CalDAV 查询事件')

  const events: CalDavEventResource[] = []
  const pending: Array<{ url: URL; etag: string }> = []
  for (const item of resources) {
    if (item.href === '') continue
    const url = resolveHref(item.href, response.url)
    if (url === null) continue
    // WeCom's REPORT also returns the collection self-entry (no etag, no calendar-data);
    // GET on that collection is a 403. Real event resources always carry an ETag here.
    if (url.href === calendar.href || url.pathname.endsWith('/')) continue
    const etag = normalizeEtag(item.props.getetag)
    const ics = (item.props['calendar-data'] ?? '').trim()
    if (ics !== '') {
      events.push({ href: url.href, ...(etag === undefined ? {} : { etag }), ics })
      continue
    }
    if (etag === undefined) continue
    pending.push({ url, etag })
  }
  // WeCom serves one .ics per GET (no multiget); bound the fan-out so a large calendar still
  // finishes well inside the client's sync budget.
  const fetched = await mapWithConcurrency(pending, EVENT_FETCH_CONCURRENCY, async item => {
    const ics = await fetchCalendarObject(item.url, auth, deps)
    return ics === null ? null : { href: item.url.href, etag: item.etag, ics }
  })
  for (const item of fetched) if (item !== null) events.push(item)
  return events
}

/** Map with a fixed concurrency, preserving input order in the result. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) return
      results[index] = await task(item)
    }
  })
  await Promise.all(workers)
  return results
}

async function discoverPrincipal(origin: URL, auth: CalDavAuth, deps: CalDavDeps): Promise<string | null> {
  // Standard chain first, then the origin itself: some servers answer /.well-known with 404 but
  // still expose current-user-principal at the root.
  const fromWellKnown = await findHrefFromPropfind(
    new URL(WELL_KNOWN_PATH, origin), '0', PRINCIPAL_PROPFIND_BODY, 'current-user-principal', auth, deps,
  )
  if (fromWellKnown !== null) return fromWellKnown
  return findHrefFromPropfind(origin, '0', PRINCIPAL_PROPFIND_BODY, 'current-user-principal', auth, deps)
}

async function findCalendarHome(principalUrl: string, auth: CalDavAuth, deps: CalDavDeps): Promise<string | null> {
  return findHrefFromPropfind(
    new URL(principalUrl), '0', HOME_PROPFIND_BODY, 'calendar-home-set', auth, deps,
  )
}

async function findHrefFromPropfind(
  url: URL,
  depth: string,
  body: string,
  propName: string,
  auth: CalDavAuth,
  deps: CalDavDeps,
): Promise<string | null> {
  const response = await requestPropfind(url, depth, body, auth, deps)
  if (response.status === 401 || response.status === 403) throwForStatus(response.status, 'CalDAV 发现')
  if (response.status < 200 || response.status >= 300) return null
  for (const item of parseWebDavBody(response, 'CalDAV 发现')) {
    const value = item.props[propName]
    if (typeof value !== 'string' || value.trim() === '') continue
    return resolveHref(value.trim(), response.url)?.href ?? null
  }
  return null
}

async function fetchCalendarObject(url: URL, auth: CalDavAuth, deps: CalDavDeps): Promise<string | null> {
  const response = await requestText(url, {
    method: 'GET',
    headers: { accept: 'text/calendar, text/plain; q=0.9, */*; q=0.1' },
  }, auth, deps)
  // A vanished object (deleted between REPORT and GET) must not fail the whole calendar.
  if (response.status === 404 || response.status === 410) return null
  ensureSuccess(response, 'CalDAV 读取事件')
  if (looksLikeHtml(response)) {
    throw new ScheduleError('AUTH_EXPIRED', 'CalDAV 读取事件时返回登录页，同步密码可能已失效', 'SCHEDULE_AUTH_EXPIRED')
  }
  return response.body
}

function requestPropfind(
  url: URL,
  depth: string,
  body: string,
  auth: CalDavAuth,
  deps: CalDavDeps,
): Promise<HttpText> {
  return requestText(url, {
    method: 'PROPFIND',
    headers: { depth, 'content-type': 'application/xml; charset=utf-8' },
    body,
  }, auth, deps)
}

/**
 * One HTTP request with Basic auth, timeout and manual redirect following.
 * Never logs or echoes the credential; only the public URL/status appears in error messages.
 */
async function requestText(
  target: URL,
  init: CalDavRequestInit,
  auth: CalDavAuth,
  deps: CalDavDeps,
): Promise<HttpText> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new ScheduleError('UNSUPPORTED', '当前运行环境缺少 fetch，无法访问 CalDAV')
  }
  const authorization = basicAuthorization(auth)
  const signal = AbortSignal.timeout(resolveTimeout(deps.timeoutMs))
  let current = target
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response
    try {
      response = await fetchImpl(current.href, {
        method: init.method,
        headers: { ...init.headers, authorization },
        body: init.body,
        redirect: 'manual',
        signal,
      })
    } catch (error) {
      throw new ScheduleError('TRANSIENT', `CalDAV 请求失败：${describeNetworkError(error)}`)
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      if (location === null || location === '') {
        throw new ScheduleError('UNSUPPORTED', `CalDAV 返回 ${response.status} 重定向但没有 Location 头`)
      }
      await discardBody(response)
      const next = new URL(location, current)
      assertRedirectAllowed(current, next)
      current = next
      continue
    }
    let body: string
    try {
      body = await response.text()
    } catch (error) {
      throw new ScheduleError('TRANSIENT', `CalDAV 响应读取失败：${describeNetworkError(error)}`)
    }
    return { url: current.href, status: response.status, contentType: response.headers.get('content-type') ?? '', body }
  }
  throw new ScheduleError('TRANSIENT', 'CalDAV 重定向次数过多')
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The body may already be consumed or unavailable; nothing to release in that case.
  }
}

function assertRedirectAllowed(from: URL, to: URL): void {
  if (from.protocol === 'https:' && to.protocol !== 'https:') {
    throw new ScheduleError('UNSUPPORTED', '拒绝 CalDAV 从 https 降级到 http 的重定向')
  }
  if (from.hostname === to.hostname) return
  // iCloud answers on a shard host (`pNN-caldav.icloud.com`); only hop inside that family.
  if (isICloudHost(from.hostname) && isICloudHost(to.hostname)) return
  throw new ScheduleError('UNSUPPORTED', '拒绝把 CalDAV 凭据转发到未允许的主机')
}

function parseWebDavBody(response: HttpText, what: string): ParsedResponse[] {
  if (looksLikeHtml(response)) {
    throw new ScheduleError('AUTH_EXPIRED', `${what}返回登录页，同步密码可能已失效`, 'SCHEDULE_AUTH_EXPIRED')
  }
  if (!/<(?:[A-Za-z_][\w.-]*:)?multistatus(?=[\s/>])/i.test(response.body)) {
    throw new ScheduleError('UNSUPPORTED', `${what}返回内容不是 WebDAV multistatus`)
  }
  return parseMultistatus(response.body)
}

function ensureSuccess(response: HttpText, what: string): void {
  if (response.status >= 200 && response.status < 300) return
  throwForStatus(response.status, what)
}

function throwForStatus(status: number, what: string): never {
  if (status === 401 || status === 403) {
    throw new ScheduleError('AUTH_EXPIRED', `${what}认证失败（HTTP ${status}），请重新获取同步密码`, 'SCHEDULE_AUTH_EXPIRED')
  }
  if (status === 429 || status >= 500) {
    throw new ScheduleError('TRANSIENT', `${what}暂时不可用（HTTP ${status}），稍后重试`, 'SCHEDULE_TRANSIENT')
  }
  throw new ScheduleError('UNSUPPORTED', `${what}失败（HTTP ${status}）`)
}

function basicAuthorization(auth: CalDavAuth): string {
  const user = typeof auth.user === 'string' ? auth.user : ''
  const password = typeof auth.password === 'string' ? auth.password : ''
  if (user === '' || password === '') {
    throw new ScheduleError('AUTH_EXPIRED', '缺少 CalDAV 账号或同步密码，请重新获取', 'SCHEDULE_AUTH_EXPIRED')
  }
  // Host runs on Node; Buffer is available and avoids the deprecated btoa/DOM dependency.
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`
}

function parseHttpUrl(raw: string, what: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ScheduleError('UNSUPPORTED', `${what}不是合法 URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ScheduleError('UNSUPPORTED', `${what}只支持 http(s)`)
  }
  if (url.username !== '' || url.password !== '') {
    // Avoid user-embedded credentials: CalDAV auth goes through the Authorization header only.
    throw new ScheduleError('UNSUPPORTED', `${what}不能内嵌凭据`)
  }
  return url
}

function resolveHref(href: string, baseUrl: string): URL | null {
  let url: URL
  try {
    url = new URL(href, baseUrl)
  } catch {
    return null
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
}

function hasCalendarResourceType(raw: string | undefined): boolean {
  return typeof raw === 'string' && /<(?:[A-Za-z_][\w.-]*:)?calendar(?=[\s/>])/i.test(raw)
}

function inferProvider(home: URL): RemoteCalendar['provider'] {
  const hostname = home.hostname.toLowerCase()
  if (hostname === 'wecom.work' || hostname.endsWith('.wecom.work')) return 'wecom'
  if (isICloudHost(hostname)) return 'icloud'
  if (hostname === 'outlook.com' || hostname.endsWith('.outlook.com')) return 'outlook'
  throw new ScheduleError('UNSUPPORTED', '无法从 CalDAV 家目录判定来源；请在 CalDavDeps 里指定 provider')
}

function isICloudHost(hostname: string): boolean {
  return hostname === 'caldav.icloud.com' || /^[a-z0-9-]+-caldav\.icloud\.com$/i.test(hostname)
}

function isWecomHost(hostname: string): boolean {
  return hostname === 'wecom.work' || hostname.endsWith('.wecom.work')
}

function lastPathSegment(pathname: string): string {
  const segments = pathname.split('/').filter(segment => segment !== '')
  const last = segments.length === 0 ? '' : segments[segments.length - 1]
  try {
    return decodeURIComponent(last)
  } catch {
    // A malformed escape in a server href is not worth failing the calendar list over.
    return last
  }
}

function normalizeEtag(value: string | undefined): string | undefined {
  const etag = (value ?? '').trim()
  return etag === '' ? undefined : etag
}

function formatCalDavTime(isoUtc: string, label: string): string {
  const ms = Date.parse(isoUtc)
  if (!Number.isFinite(ms)) {
    throw new ScheduleError('UNSUPPORTED', `拉取窗口${label}时间不合法`)
  }
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')
}

function resolveTimeout(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : SCHEDULE_REQUEST_TIMEOUT_MS
}

function looksLikeHtml(response: HttpText): boolean {
  if (/text\/html/i.test(response.contentType)) return true
  return /^\s*<(?:!doctype\s+html|html)\b/i.test(response.body)
}

function describeNetworkError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return '请求超时或被中止'
  }
  return error instanceof Error ? error.message : String(error)
}
