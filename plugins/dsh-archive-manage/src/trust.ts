/**
 * 浏览器信任栅栏：官方 `isTrustedApiRequest` / `isLoopbackHostname` 同口径，纯逻辑供单测。
 * 插件要自带这道门：官方栅栏只挂在 `/api` 前缀路由上，而 webServer 的前缀匹配取最长者命中，
 * 本插件的 `/api/archive-manage` 更长 ⇒ 官方那道门（含浏览器令牌鉴权）根本不会执行。
 * Host 栅栏对所有请求生效 —— DNS rebinding 伪造不了 Host；Origin 为 "null" 的不透明源拒绝。
 */

/** 规范化一个 Host 头 authority（hostname 小写、缺省端口去掉、IPv6 带括号）；不可解析时 undefined。 */
export function parseAuthority(authority: string): URL | undefined {
  try {
    // http: 是 WHATWG「special scheme」：解析结果必有非空 hostname，否则抛错。
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

/** authority 规范形式：写了端口即 `hostname:port`，否则只有 `hostname`。端口走两次 URL 解析判断
 * （http 与 https 缺省端口不同，显式 `:80` / `:443` 仍算显式）—— 绝不能从原始字符串上切。 */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** 条目是否命中请求 authority：带端口的条目只匹配该确切 authority，不带端口的条目匹配该主机名的任意端口。 */
export function isTrustedAuthority(hostUrl: URL, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/**
 * 断言一条 `allowedHosts` 条目是**裸 authority**（`host` 或 `host:port`）：会被静默改写的条目
 * （路径 / `user@` / 空白 / 悬空冒号 / 补零端口 / 非规范主机拼写）必须在加载时响亮失败，
 * 而不是延到请求期 403、或悄悄放宽成整域授权。
 */
export function assertTrustedAuthority(entry: string): void {
  const entryUrl = parseAuthority(entry)
  if (entryUrl !== undefined && canonicalAuthority(entry, entryUrl) === entry.toLowerCase()) return
  throw new Error(`allowedHosts 条目 ${JSON.stringify(entry)} 不是裸 host[:port] authority`)
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
 * 回环之外的补充信任面：`webStartup.trustedHosts`（rc.2 起即喂给官方 `/api` 栅栏的同一份值）优先，
 * 旧宿主回退 `webRuntime`，两份合并去重 —— 复用可免自造白名单把 LAN 部署静默挡死；再把 webServer
 * 的**监听绑定地址**纳入（官方 rc.2 栅栏同样接受绑定地址本身，任意端口）。服务缺失（老宿主 /
 * 非 web 部署）时为空 = 只认回环（`ctx.get` 可选读取，绝不因此让插件抛穿）。
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

/** 与官方同口径的请求检查：Host 必须回环或命中信任面，且不得跨站 / 异源（Origin 与 Host 自洽
 * 不足以证明可信 —— 被 rebind 的页面两者自洽，但 Host 是攻击者域名）。 */
export function isTrustedPluginRequest(
  headers: { host?: string; origin?: string; 'sec-fetch-site'?: string },
  allowedHosts: readonly string[] = [],
): boolean {
  // Host 栅栏（DNS rebinding 防御）：被 rebind 的页面带的是攻击者域名，即使 socket 落到本机。
  const host = headers.host
  if (host === undefined || host === '') return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, allowedHosts)) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  // Origin 栅栏：带了就必须与 Host 同 authority；无 Origin 可以。字面量 "null"（沙箱 iframe / file:）是不透明源，解析失败即拒绝。
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}
