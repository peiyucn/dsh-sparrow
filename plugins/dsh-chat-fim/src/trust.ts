/**
 * 浏览器信任栅栏（对齐官方 `isTrustedApiRequest` / `loopback-hostname`）。
 * 官方那道门连同令牌鉴权只挂在 `/api` 前缀路由上，本插件的 exact 路由与插件前缀都不经过它，故自装一道。
 * Host 是 rebinding 伪造不了的头部，故 Host 栅栏对所有请求生效——无标记的请求也可能是被 rebind 的页面读取。
 */

/** 规范化 Host 头 authority（hostname 小写、缺省端口去掉、IPv6 带括号），不可解析时 undefined。 */
export function parseAuthority(authority: string): URL | undefined {
  try {
    // http: 是 WHATWG「special scheme」：解析结果必有非空 hostname，否则抛错。
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** 是否回环地址：`localhost`、IPv6 回环，或 127/8 的任意 IPv4（IPv6 字面量保留方括号）。 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** authority 的规范形式：写了端口即 `hostname:port`，否则只是 `hostname`。端口只由两次 URL 解析判定——http 与 https 缺省端口不同，故显式 `:80` / `:443` 仍算显式，绝不从原始字符串切。 */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** 带端口的条目只匹配该确切 authority，不带端口的条目匹配该主机名的任意端口；两侧都走 WHATWG 规范化。 */
export function isTrustedAuthority(hostUrl: URL, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/** 与官方 `isTrustedApiRequest` 逐项同口径的请求检查；`allowedHosts` 默认为空 = 只认回环。 */
export function isTrustedBrowserRequest(
  headers: { host?: string; origin?: string; 'sec-fetch-site'?: string } | undefined,
  allowedHosts: readonly string[] = [],
): boolean {
  if (headers === undefined || headers === null) return false
  // Host 栅栏（DNS rebinding 防御）：无标记的请求也可能是被 rebind 的页面，而它带的是攻击者域名。
  const host = headers.host
  if (host === undefined || host === '') return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, allowedHosts)) return false
  // 跨站栅栏：显式 cross-site 一律拒绝。
  if (headers['sec-fetch-site'] === 'cross-site') return false
  // Origin 栅栏：带 Origin 时必须与 Host 逐 authority 相同；无 Origin 可以（Host 栅栏已约束）；字面量 "null" 是不透明源，拒绝。
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** 读一个官方服务值里的 `trustedHosts`：服务缺失 / 读取抛错 / 形状不对一律按空处理
 * （`ctx.get` 可选读取，绝不因此让插件抛穿）。 */
function trustedHostsOfService(ctx: { get(name: string): unknown }, serviceName: string): readonly string[] {
  let service: unknown
  try {
    service = ctx.get(serviceName)
  } catch {
    // 宿主不认识该服务名（老版本 / 代理路径）时按「无额外信任」处理。
    return []
  }
  if (typeof service !== 'object' || service === null) return []
  const value = (service as { trustedHosts?: unknown }).trustedHosts
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** webServer 的监听绑定地址作为一条 authority：IPv6 字面量加方括号、去掉 `%zone`（接口选择器，不是
 * 地址文本）；服务缺失 / 读取抛错 / 形状不对时为空。 */
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
 * 读官方信任面 `webStartup.trustedHosts`（rc.2 起，与官方 `/api` 栅栏同一份取值；旧宿主回退
 * `webRuntime`），两份合并去重，再把 webServer 的监听绑定地址纳入（官方 rc.2 栅栏同样接受绑定
 * 地址本身）——而非自造白名单：语义一致、LAN 部署不被静默挡死、不留第二份真相。
 * 服务缺失（老宿主 / 非 web 部署）回退为空 = 只认回环；走 `ctx.get` 取可选服务，缺了不阻插件启动。
 */
export function officialTrustedHosts(ctx: { get(name: string): unknown }): readonly string[] {
  return [
    ...new Set([
      ...trustedHostsOfService(ctx, 'webStartup'),
      ...trustedHostsOfService(ctx, 'webRuntime'),
      ...bindAddressAuthority(ctx),
    ]),
  ]
}
