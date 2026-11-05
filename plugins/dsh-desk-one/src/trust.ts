/**
 * 浏览器信任栅栏：与官方 `isTrustedApiRequest` / `isLoopbackHostname` 同口径，纯逻辑供单测。
 * 本插件自带这道门：官方栅栏只挂在 `/api` 前缀路由上，而 webServer 的前缀匹配取最长者命中，
 * 本插件的 `/api/desk-one` 更长 ⇒ 官方那道门（含浏览器令牌鉴权）根本不会执行。
 * Host 栅栏对所有请求生效 —— DNS rebinding 伪造不了 Host；Origin 为 "null" 的不透明源拒绝。
 */

import { PACKAGE_NAME } from './constants.js'

/** 规范化一个 Host 头 authority（hostname 小写、缺省端口去掉、IPv6 带括号）；不可解析时 undefined。 */
export function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** 是否回环地址：`localhost`、IPv6 回环，或 127/8 的任意 IPv4。 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** authority 规范形式：写了端口即 `hostname:port`，否则只有 `hostname`。 */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** 条目是否命中请求 authority：带端口的条目只匹配该确切 authority，不带端口的匹配该主机名任意端口。 */
export function isTrustedAuthority(hostUrl: URL, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/** 断言一条 `allowedHosts` 条目是裸 authority（`host` 或 `host:port`）。 */
export function assertTrustedAuthority(entry: string): void {
  const entryUrl = parseAuthority(entry)
  if (entryUrl !== undefined && canonicalAuthority(entry, entryUrl) === entry.toLowerCase()) return
  throw new Error(`allowedHosts 条目 ${JSON.stringify(entry)} 不是裸 host[:port] authority`)
}

function trustedHostsOfService(ctx: { get(name: string): unknown }, serviceName: string): readonly string[] {
  let service: unknown
  try {
    service = ctx.get(serviceName)
  } catch {
    return []
  }
  if (typeof service !== 'object' || service === null) return []
  const value = (service as { trustedHosts?: unknown }).trustedHosts
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function bindAddressAuthority(ctx: { get(name: string): unknown }): readonly string[] {
  let server: unknown
  try {
    server = ctx.get('webServer')
  } catch {
    return []
  }
  if (typeof server !== 'object' || server === null) return []
  const host = (server as { host?: unknown }).host
  if (typeof host !== 'string' || host === '') return []
  const zoneAt = host.indexOf('%')
  const address = zoneAt === -1 ? host : host.slice(0, zoneAt)
  return [address.includes(':') ? `[${address}]` : address]
}

/**
 * 回环之外的补充信任面：`webStartup.trustedHosts` 优先，旧宿主回退 `webRuntime`，再把 webServer
 * 的监听绑定地址纳入；非法条目丢弃并告警，不抛错（官方信任面异常不应让插件停用）。
 */
export function officialTrustedHosts(ctx: {
  get(name: string): unknown
  logger?: { warn(message: string): void }
}): readonly string[] {
  const entries = [
    ...new Set([
      ...trustedHostsOfService(ctx, 'webStartup'),
      ...trustedHostsOfService(ctx, 'webRuntime'),
      ...bindAddressAuthority(ctx),
    ]),
  ]
  const trusted: string[] = []
  for (const entry of entries) {
    try {
      assertTrustedAuthority(entry)
      trusted.push(entry)
    } catch {
      ctx.logger?.warn(`${PACKAGE_NAME}: 丢弃非法的官方 allowedHosts 条目 ${JSON.stringify(entry)}，只用其余信任面`)
    }
  }
  return trusted
}

/** 与官方同口径的请求检查：Host 必须回环或命中信任面，且不得跨站 / 异源。 */
export function isTrustedPluginRequest(
  headers: { host?: string; origin?: string; 'sec-fetch-site'?: string },
  allowedHosts: readonly string[] = [],
): boolean {
  const host = headers.host
  if (host === undefined || host === '') return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, allowedHosts)) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}
