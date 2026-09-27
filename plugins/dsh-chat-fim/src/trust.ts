/**
 * 浏览器信任栅栏（对齐官方 `packages/client/connection/src/api-request-trust.ts` +
 * `loopback-hostname.ts`）。
 *
 * **为什么插件要自己装这道门**：官方栅栏连同浏览器令牌鉴权都注册在官方自己的 `/api`
 * **前缀**路由上（`packages/client/connection/src/index.ts` 的 `{kind:'prefix', path:'/api'}`，
 * 准入判定在 `rpc-host.ts:requestRejection` → 先 403 后 401），而 webServer 的路由解析是
 * 「先查 exact 表，未命中再在 prefix 表里取最长前缀」（`packages/host/webserver/src/index.ts`
 * 的 `match()`）。本插件的 exact 路由与插件前缀都不会经过官方那道门。
 *
 * 2026-09 实测（本机运行中的实例，不带任何凭据）：官方 `/api/sessions` → 401，
 * 而各插件的 `/api/<plugin>` 路由 → **200**。
 *
 * **Host 栅栏对所有请求生效**，不止有浏览器标记的那些：官方注释写明「over plain HTTP a
 * browser attaches neither Origin nor Fetch-Metadata to reads (images and navigations)」，
 * 故一个无标记的请求仍可能是被 rebind 的浏览器读取，而 Host 是 rebinding 伪造不了的头部。
 * 只比「Origin 与 Host 是否同源」是不够的 —— 被 rebind 的页面两者自洽，但 Host 是攻击者域名。
 *
 * 判定是纯逻辑，供单测。
 */

/**
 * 规范化一个 Host 头 authority（hostname 小写、缺省端口去掉、IPv6 带括号），
 * 不可解析时 undefined。
 * @param authority - Host 头的原始取值。
 * @returns 规范化 URL，或 undefined。
 */
export function parseAuthority(authority: string): URL | undefined {
  try {
    // http: 是 WHATWG「special scheme」：解析结果必有非空 hostname，否则抛错。
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/**
 * 是否回环地址：`localhost`、IPv6 回环，或 127/8 的任意 IPv4。
 * @param hostname - WHATWG URL 的 hostname（IPv6 字面量保留方括号）。
 * @returns 是回环地址时 true。
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * authority 的规范形式：写了端口就是 `hostname:port`，否则只是 `hostname`。
 * 端口一律从**两次 URL 解析**判断（http 与 https 的缺省端口不同，故显式 `:80` / `:443`
 * 仍算显式），绝不从原始字符串切 —— 那样会把 `host:port ` 这类形状误读成无端口。
 * @param entry - 配置里的原始条目。
 * @param entryUrl - 其 http 解析结果。
 * @returns 规范形式（小写）。
 */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/**
 * 条目是否命中请求 authority：带端口的条目只匹配该确切 authority；不带端口的条目
 * 匹配该主机名的**任意端口**。两侧都走 WHATWG 规范化，故大小写与冗余 `:80` 都不决定信任。
 * @param hostUrl - 请求 Host 的解析结果。
 * @param allowedHosts - 额外信任的 authority。
 * @returns 命中时 true。
 */
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
 * 与官方 `isTrustedApiRequest` 逐项同口径的请求检查。
 * @param headers - Node 请求头。
 * @param allowedHosts - 回环之外额外信任的 authority（默认空 = 只认回环）。
 * @returns 可信时 true。
 */
export function isTrustedBrowserRequest(
  headers: { host?: string; origin?: string; 'sec-fetch-site'?: string } | undefined,
  allowedHosts: readonly string[] = [],
): boolean {
  if (headers === undefined || headers === null) return false
  // Host 栅栏（DNS rebinding 防御）：浏览器按它以为的 URL 填 Host，被 rebind 的页面带的是
  // 攻击者域名，即使 socket 落到本机。
  const host = headers.host
  if (host === undefined || host === '') return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, allowedHosts)) return false
  // 跨站栅栏：现代浏览器在每个 fetch 上都标注发起方关系，显式 cross-site 一律拒绝。
  if (headers['sec-fetch-site'] === 'cross-site') return false
  // Origin 栅栏：浏览器带 Origin 时必须与 Host 逐 authority 相同（同一套规范化）；
  // 无 Origin 可以 —— 上面的 Host 栅栏已经约束住了。字面量 "null"（沙箱 iframe / file:）
  // 是不透明源，拒绝。
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/**
 * 回环判定的补充信任面：读取官方 `webRuntime.trustedHosts`（由官方 `@deepseek-ai/dsh-web-app`
 * 在 `webServer` 绑定后 `ctx.provide('webRuntime', …)` 一次采样给出）。
 *
 * **为什么读官方这个服务而不是自定义配置**：官方同一份取值就是喂给 `/api` 栅栏的那一份
 * （`web-app/src/index.ts` 的 `resolveLanTrust`：`trustedHosts: [...lanAddresses, ...extra]`，
 * 其中 `lanAddresses` 是绑定 `0.0.0.0` 时按网卡采样出的 LAN 地址）。复用它有两个好处：
 * ① 语义与官方逐字一致，LAN 部署不会因为插件自造的白名单而被静默挡死；
 * ② 官方若改变采样口径，本插件自动跟随，不会留下第二份真相。
 *
 * 服务缺失（老宿主 / 非 web 部署）时回退为空 = 只认回环，与官方 `trustedHosts` 默认值一致。
 * 走 `ctx.get`（可选服务）而非 `inject`：本插件不该因为缺这个服务就不启动。
 * @param ctx - 插件上下文。
 * @returns 官方信任的 authority 列表（服务缺失时为空数组）。
 */
export function officialTrustedHosts(ctx: { get(name: string): unknown }): readonly string[] {
  let runtime: unknown
  try {
    runtime = ctx.get('webRuntime')
  } catch {
    // 宿主不认识该服务名（极端老版本）时按「无额外信任」处理，绝不因此让插件抛穿。
    return []
  }
  if (typeof runtime !== 'object' || runtime === null) return []
  const value = (runtime as { trustedHosts?: unknown }).trustedHosts
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}
