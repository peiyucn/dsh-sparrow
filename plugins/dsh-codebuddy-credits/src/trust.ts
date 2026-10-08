/**
 * 浏览器信任栅栏：DNS rebinding 与跨站请求防御（对齐官方 `/api` 栅栏口径）。
 *
 * 为什么插件必须自带：官方 Host/Origin 栅栏与浏览器令牌认证只注册在 `/api` **前缀**路由上，
 * 而官方 webServer 路由匹配是「精确表优先、前缀最长者胜」，本插件的 `/api/codebuddy-credits`
 * 更长 → 命中本路由后**永远不会**再经过官方栅栏。本路由能改用户凭据与设置、触发计费上游调用，
 * 故必须在**任何路由分发与请求体读取之前**先过这道栅栏。
 *
 * 网络可达性与身份认证不在本栅栏范围内：端口绑定归 webServer 配置，令牌认证归官方连接层。
 */

/** 本栅栏读取的请求头（Node `IncomingMessage.headers` 的子集）。 */
export interface TrustHeaders {
  host?: string
  origin?: string
  'sec-fetch-site'?: string
}

const IPV4_PART_COUNT = 4
const LOOPBACK_FIRST_OCTET = '127'
const MAX_OCTET = 255

const OCTET_RE = /^\d{1,3}$/u

/**
 * Host 头 authority 归一化后的 URL（hostname 小写、默认端口剥离、IPv6 带括号）；不可解析时 undefined。
 * `http:` 是 WHATWG 的 special scheme：解析结果要么有非空 hostname，要么抛错。
 */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** 归一化后的 hostname 是否指向本机回环（官方 `isLoopbackHostname` 同口径；IPv6 字面量带方括号）。 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === IPV4_PART_COUNT
    && parts[0] === LOOPBACK_FIRST_OCTET
    && parts.every(part => OCTET_RE.test(part) && Number(part) <= MAX_OCTET)
}

/**
 * 已解析 authority 的规范形式：没写端口时是 `hostname`，写了就是 `hostname:port`。
 * 端口判定必须走 URL 解析、不能看原始字符串（WHATWG 会吃掉首尾空白，从字符串读会误判成无端口）。
 */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  // 在 http 下能解析的 authority，在 https 下也一定能解析。
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/**
 * 请求 authority 是否命中一条官方信任面条目：带显式端口的条目只匹配该 authority，不带端口的
 * 条目匹配该 hostname 的**任意端口**（IP 字面量的 LAN 直连即此形状）。两侧都经 WHATWG 归一化比较。
 */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/**
 * 判定一个请求是否可信（可进入本插件路由）。
 *
 * Host 栅栏对所有请求生效（Host 是 rebinding 唯一伪造不了的头）：缺失 / 不可解析 / 既非回环
 * 又不在官方信任面 → 拒绝。没有「没有浏览器标记就放行」的捷径——纯 HTTP 下浏览器的图片 /
 * 导航读取既不带来 Origin 也不带 Fetch-Metadata，与 curl 无法区分，而其响应能被 rebinding 页面读走。
 * `sec-fetch-site: cross-site` 一律拒绝；带 Origin 时必须与 Host 同 authority（两侧都经 WHATWG 归一化）；
 * `origin: "null"`（沙箱 iframe / `file:` 页面）与畸形 Origin 拒绝；无 Origin 才放行。
 * headers 整体缺失按**不可信**处理（fail-closed），不许因畸形输入抛错。
 */
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

/**
 * 官方给出的额外信任面（回环之外的 authority）：**直接把官方那份取值喂给栅栏**，不自造第二份白名单
 * ——自造会与官方的 LAN 采样口径漂移，且会把 `--host 0.0.0.0` 用户的正常访问静默挡成 403。
 *
 * ⚠️ 必须在**请求期**读取而不是 `apply` 期定值：webRuntime 由 web-app 的 `apply` 提供，与本插件
 * 加载顺序不保证谁先，`apply` 期读会拿到空值并被永久冻结。服务缺失时回退空数组 = 只认回环。
 */
export function officialTrustedHosts(ctx: { get(name: string): unknown }): readonly string[] {
  let runtime: unknown
  try {
    runtime = ctx.get('webRuntime')
  } catch {
    // 宿主不认识该服务名时按「无额外信任」处理，绝不因此让插件抛穿。
    return []
  }
  if (typeof runtime !== 'object' || runtime === null) return []
  const value = (runtime as { trustedHosts?: unknown }).trustedHosts
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}
