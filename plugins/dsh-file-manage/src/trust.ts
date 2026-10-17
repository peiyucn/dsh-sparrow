/**
 * 浏览器信任栅栏：DNS rebinding 与跨站请求防御（与官方 `/api` 栅栏同口径）。插件必须自带：
 * 官方栅栏与令牌认证都挂在 `/api` **前缀**路由上，而 webServer 前缀匹配取最长者，本插件的
 * `/api/file-manage` 更长 ⇒ 官方那道门永不执行；DELETE 会删用户云端文件，故在任何路由分发与
 * 请求体读取之前先过这道栅栏。Host 栅栏对所有请求生效（rebinding 伪造不了 Host）；
 * `origin: "null"` 的不透明源拒绝。
 */

/** 本栅栏读取的请求头（Node `IncomingMessage.headers` 的子集）。 */
export interface TrustHeaders {
  host?: string
  origin?: string
  'sec-fetch-site'?: string
}

const IPV4_PART_COUNT = 4
/** 回环网段首段（127/8）。 */
const LOOPBACK_FIRST_OCTET = '127'
const MAX_OCTET = 255

const OCTET_RE = /^\d{1,3}$/u

/** Host 头 authority 归一化成 URL（hostname 小写、默认端口剥离、IPv6 带括号）；不可解析时 undefined。
 * `http:` 是 WHATWG special scheme：解析结果要么有非空 hostname，要么抛错。 */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** 归一化 hostname 是否指向本机回环（官方 `isLoopbackHostname` 同口径）。 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === IPV4_PART_COUNT
    && parts[0] === LOOPBACK_FIRST_OCTET
    && parts.every(part => OCTET_RE.test(part) && Number(part) <= MAX_OCTET)
}

/**
 * 已解析 authority 的规范形式：`hostname` 或 `hostname:port`。端口判定必须走 URL 解析
 * （special scheme 缺省端口不同，显式 `:80` / `:443` 仍算显式），不能看原始字符串（空白会被 WHATWG 吃掉）。
 */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  // 在 http 下能解析的 authority，在 https 下也一定能解析。
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** 请求 authority 是否命中一条官方信任面条目：带端口的只匹配该 authority，不带端口的匹配该 hostname
 * 的**任意端口**（LAN 直连即此形状，端口可能由系统分配）；两侧都经 WHATWG 归一化比较。 */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/** 判定请求是否可信（可进入本插件路由）。请求头整体缺失按**不可信**处理（fail-closed）：
 * 入口不许因畸形输入抛错，也不许在缺头时放行。 */
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
 * 官方给出的额外信任面：`webStartup.trustedHosts`（rc.2 起即喂给官方 `/api` 栅栏的同一份值；旧宿主
 * 回退 `webRuntime`），两份合并去重，再把 webServer 的监听绑定地址纳入（官方 rc.2 栅栏同样接受
 * 绑定地址本身）—— 自造白名单会语义漂移，还会把 LAN 用户静默挡成 403；服务缺失时回退空
 * （只认回环，与官方默认同口径）。⚠️ 必须**请求期**读取：`webStartup` 与本插件加载顺序不保证
 * 谁先，apply 期读会拿到空值并永久冻结。
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
