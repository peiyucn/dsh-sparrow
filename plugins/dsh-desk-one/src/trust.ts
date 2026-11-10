/**
 * Browser trust fence: same rules as the official `isTrustedApiRequest` / `isLoopbackHostname`, pure logic for unit tests.
 * The plugin carries this gate itself: the official fence only hangs on routes prefixed `/api`, while webServer's prefix
 * matching picks the longest hit, and this plugin's `/api/desk-one` is longer ⇒ the official gate (including browser
 * token auth) never runs. The Host fence applies to every request — DNS rebinding cannot forge Host; opaque origins
 * whose Origin is "null" are rejected.
 */

import { PACKAGE_NAME } from './constants.js'

/** Normalize a Host header authority (lowercase hostname, default port dropped, IPv6 in brackets); undefined when unparseable. */
export function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Whether the address is loopback: `localhost`, the IPv6 loopback, or any IPv4 in 127/8. */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Canonical authority form: `hostname:port` when a port was written, otherwise just `hostname`. */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** Whether an entry matches the request authority: entries with a port match only that exact authority, entries without a port match that hostname on any port. */
export function isTrustedAuthority(hostUrl: URL, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/** Assert that an `allowedHosts` entry is a bare authority (`host` or `host:port`). */
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
 * Extra trust surface beyond loopback: `webStartup.trustedHosts` first, falling back to `webRuntime` on older hosts,
 * plus the webServer's listen bind address; invalid entries are dropped with a warning instead of throwing (a broken
 * official trust surface should not disable the plugin).
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

/** Request check with the same rules as the official one: Host must be loopback or hit the trust surface, and must not be cross-site / cross-origin. */
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
