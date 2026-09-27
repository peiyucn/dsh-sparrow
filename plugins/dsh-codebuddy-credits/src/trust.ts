/**
 * 浏览器信任栅栏：DNS rebinding 与跨站请求防御（与官方 /api 栅栏同口径）。
 *
 * ## 为什么插件必须自带（官方栅栏为什么落不到本路由）
 *
 * 官方的 Host/Origin 栅栏与浏览器令牌认证都注册在 `/api` **前缀**路由上
 * （`packages/client/connection/src/index.ts` 的 `{ kind: 'prefix', path: API_PATH }`，
 * 准入判定在 `rpc-host.ts` 的 `requestRejection`：先 403、后 401）。而官方 webServer 的
 * 路由匹配是**精确表优先、前缀最长者胜**（`packages/host/webserver/src/index.ts` 的 `match()`）
 * ——本插件的 `/api/codebuddy-credits` 比 `/api` 长，请求命中本路由后**永远不会**再经过官方栅栏。
 * 后果：用户访问的恶意网页可以盲发跨站 no-cors 请求（CSRF），DNS rebinding 同样能打进来
 * （官方注释原话：Host 是 rebinding 唯一伪造不了的头）。本插件路由能改用户凭据与设置、
 * 触发计费上游调用，因此在**任何路由分发与请求体读取之前**先过这道栅栏。
 *
 * ## 判定口径
 *
 * 逐条对齐官方 `packages/client/connection/src/api-request-trust.ts` 的 `isTrustedApiRequest`
 * 与 `loopback-hostname.ts` 的 `isLoopbackHostname`：
 *
 * 1. **Host 栅栏对所有请求生效**：Host 缺失 / 不可解析 / 既非回环、也不在官方信任面里，
 *    一律拒绝。没有「没有浏览器标记就放行」的捷径——纯 HTTP 下浏览器的图片 / 导航读取既不
 *    带 Origin 也不带 Fetch-Metadata（那些头只发往可信目标），与 curl 无法区分，而它的响应
 *    能被 rebinding 页面读走。
 * 2. `sec-fetch-site: cross-site` 一律拒绝（有没有 Origin 都拒）。
 * 3. 带 Origin 时必须与 Host 同 authority（两侧都经 WHATWG 归一化，故大小写与多余的
 *    `:80` 不参与判定）；`origin: "null"`（沙箱 iframe / `file:` 页面）与畸形 Origin 拒绝。
 *
 * 回环之外的额外信任面**复用官方 `webRuntime.trustedHosts`**（见 {@link officialTrustedHosts}），
 * 不自造第二份白名单。
 *
 * 网络可达性与身份认证不在本栅栏范围内：端口绑定归 webServer 配置，令牌认证归官方连接层。
 */

/** 本栅栏读取的请求头（Node `IncomingMessage.headers` 的子集）。 */
export interface TrustHeaders {
  host?: string
  origin?: string
  'sec-fetch-site'?: string
}

/** IPv4 点分十进制段数。 */
const IPV4_PART_COUNT = 4
/** 回环网段首段（127/8）。 */
const LOOPBACK_FIRST_OCTET = '127'
/** 单个八位组的数值上限。 */
const MAX_OCTET = 255

/** 单个八位组：1-3 位数字。 */
const OCTET_RE = /^\d{1,3}$/u

/**
 * Host 头 authority 归一化后的 URL（hostname 小写、默认端口剥离、IPv6 带括号）；不可解析时 undefined。
 *
 * `http:` 是 WHATWG 的 special scheme：解析结果要么有非空 hostname，要么抛错。
 */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/**
 * 归一化后的 hostname 是否指向本机回环（官方 `isLoopbackHostname` 同口径）。
 * @param hostname - WHATWG URL 的 hostname（IPv6 字面量保留方括号）。
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === IPV4_PART_COUNT
    && parts[0] === LOOPBACK_FIRST_OCTET
    && parts.every(part => OCTET_RE.test(part) && Number(part) <= MAX_OCTET)
}

/**
 * 已解析 authority 的规范形式：没写端口时是 `hostname`，写了就是 `hostname:port`。
 *
 * 端口判定必须走 URL 解析（两个 special scheme 的默认端口不同，故 `:80` / `:443` 仍算显式），
 * 不能看原始字符串——WHATWG 会把 `host:port ` 这类形状的首尾空白吃掉，从字符串上读会误判成无端口。
 */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  // 在 http 下能解析的 authority，在 https 下也一定能解析。
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/**
 * 请求 authority 是否命中一条官方信任面条目。
 *
 * 带显式端口的条目只匹配该 authority；不带端口的条目匹配该 hostname 的**任意端口**
 * （IP 字面量的 LAN 直连就是这个形状，端口可能由系统分配）。两侧都经 WHATWG 归一化比较。
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
 * 请求头整体缺失按**不可信**处理（fail-closed）：host half 的入口不许因畸形输入抛错，
 * 更不许在缺头时放行。
 * @param headers - 请求头（Node `IncomingMessage.headers`）；缺失即拒绝。
 * @param trustedHosts - 回环之外额外信任的 authority（调用方传官方信任面，缺省空 = 只信回环）。
 * @returns Host 属于本机（回环或官方信任面）且附带的浏览器标记同源时 true。
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
 * 官方给出的额外信任面（回环之外的 authority），直接把**官方那份取值**喂给栅栏。
 *
 * **为什么不自定义 allowedHosts 配置**：官方 `@deepseek-ai/dsh-web-app`（`src/index.ts` 的
 * `resolveLanTrust` + `apply`）在 webServer 绑定后采样一次 LAN 地址，`ctx.provide('webRuntime', ...)`
 * 提供出去；那份 `trustedHosts` 就是**喂给官方 `/api` 栅栏的同一份值**。自造第二份白名单有两个坑：
 * ① 语义会漂——官方若改了 LAN 地址采样口径（如换绑定策略），插件不会跟随；
 * ② 会静默挡死合法部署——`--host 0.0.0.0` 的 LAN 用户从不需要手配任何白名单，插件自造的列表
 * 会把他的正常访问变成 403。复用它则「官方信什么，插件就信什么」，逐字一致。
 *
 * 服务缺失（老宿主 / 非 web 组合）时回退为空 = 只认回环，与官方 `trustedHosts` 默认值同口径；
 * 走 `ctx.get` 可选读取（`vendor/cordis/src/reflect.ts` 的 `_getImpl` 在服务缺席时返回
 * undefined，不抛），本插件不该因为缺这个服务就停掉。
 *
 * ⚠️ 必须在**请求期**读取而不是 `apply` 期定值：webRuntime 由 web-app 的 `apply` 提供，
 * 与本插件的加载顺序不保证谁先；`apply` 期读会拿到空值并被永久冻结。
 * @param ctx - 插件上下文（只用到 `get`）。
 * @returns 官方信任的 authority 列表（服务缺失 / 形状不认识时为空数组）。
 */
export function officialTrustedHosts(ctx: { get(name: string): unknown }): readonly string[] {
  let runtime: unknown
  try {
    runtime = ctx.get('webRuntime')
  } catch {
    // 宿主不认识该服务名（极端老版本 / 代理路径）时按「无额外信任」处理，绝不因此让插件抛穿。
    return []
  }
  if (typeof runtime !== 'object' || runtime === null) return []
  const value = (runtime as { trustedHosts?: unknown }).trustedHosts
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}
