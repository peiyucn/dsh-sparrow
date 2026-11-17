


export interface TrustHeaders {
  host?: string
  origin?: string
  'sec-fetch-site'?: string
}

const IPV4_PART_COUNT = 4
const LOOPBACK_FIRST_OCTET = '127'
const MAX_OCTET = 255

const OCTET_RE = /^\d{1,3}$/u


function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}


export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === IPV4_PART_COUNT
    && parts[0] === LOOPBACK_FIRST_OCTET
    && parts.every(part => OCTET_RE.test(part) && Number(part) <= MAX_OCTET)
}


function canonicalAuthority(entry: string, entryUrl: URL): string {

  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}


function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}


export function isTrustedPluginRequest(headers: TrustHeaders | undefined, trustedHosts: readonly string[] = []): boolean {
  if (headers === undefined || headers === null) return false
  const host = headers.host
  if (host === undefined || host === '') return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
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


export function officialTrustedHosts(ctx: { get(name: string): unknown }): readonly string[] {
  return [
    ...new Set([
      ...trustedHostsOfService(ctx, 'webStartup'),
      ...trustedHostsOfService(ctx, 'webRuntime'),
      ...bindAddressAuthority(ctx),
    ]),
  ]
}
