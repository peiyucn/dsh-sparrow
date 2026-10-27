/**
 * 宿主兼容自检：host half 缺能力即告警并抛错（cordis 把插件标 inactive）；client half 只能告警并返回 false ——
 * 客户端 boot 审计把任一非 active entry 当致命失败，抛错会让整页只渲染 "Failed to load plugins"。
 * 判定与文案是纯逻辑，供单测。
 *
 * 本模块**不 import 任何官方包**：client half 也要用它，而官方 host 包带 Node 内建依赖（打不进浏览器 bundle）；
 * 需要常量探针的 `hostSessionFormatVersion()` 在 host 专用的 session-format.ts 里。
 */

/**
 * 本插件构建时对齐的 dsh 会话格式版本（官方格式是单调整数）：认错格式会静默读不出主路由，故只声明已知可安全处理的版本。
 * `list()/stat()` 的 header 已被持久化层翻译成当前逻辑版本（恒等于宿主 `SESSION_FORMAT_VERSION`），不反映磁盘物理代。
 */
export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3, 4]

/** 面向日志/错误的统一停用前缀。 */
function disabledLine(pluginName: string, reason: string): string {
  return `${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`
}

/** 宿主会话格式是否可安全处理；不可时返回可直接进日志的原因（非数字等未知形状一律按不支持处理）。 */
export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅支持 ${supported.map(value => `v${value}`).join(' / ')}`
}

/**
 * 宿主**真值**格式门：以宿主给出的 `header.version` 为准，与「插件解析到哪份官方包」无关。
 * 常量探针在 `link:` / peer 副本场景会读到插件自己的旧版官方包而误判兼容，header 由宿主产生，是唯一不受该问题影响的信号。
 */
export function unsupportedStoredFormatReason(
  headers: readonly { readonly version?: unknown }[],
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  for (const header of headers) {
    const reason = unsupportedSessionFormatReason(header.version, supported)
    if (reason !== undefined) return `${reason}（宿主会话 header）`
  }
  return undefined
}

/** 一项宿主能力：`name` 进日志，`ok` 由调用方探测（服务/方法/导出是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/** 能力门：宿主缺少任一必需能力即告警并抛错（自停用）。 */
export function assertCapabilities(
  ctx: { logger: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly HostCapability[],
): void {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return
  const reason = `缺少本插件依赖的 ${missing.join('、')}`
  ctx.logger.warn(disabledLine(pluginName, reason))
  throw new Error(`${pluginName}: ${reason}`)
}

/**
 * 启动自检：宿主不兼容即停用本插件（抛错）。
 * cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive，dsh 与其余插件不受影响；抛错前先记一条面向用户的告警，说明为什么停用、怎么恢复。
 * @param version - 宿主会话格式版本，host 侧传 `hostSessionFormatVersion()`（见 session-format.ts）。
 */
export function assertHostCompatible(
  ctx: { logger: { warn(message: string): void } },
  pluginName: string,
  version: unknown,
): void {
  const reason = unsupportedSessionFormatReason(version)
  if (reason === undefined) return
  ctx.logger.warn(disabledLine(pluginName, reason))
  throw new Error(`${pluginName}: ${reason}`)
}

/**
 * client 能力门：缺任一必需能力即**惰性停用** —— 只告警并返回 false，**绝不抛错**，调用方直接 `return`
 * （不注册任何槽位 / 样式 / 监听）。两条告警通道都要写：客户端 logger 只有环形缓冲 exporter、浏览器侧没有
 * console 通道，只写 logger 用户永远看不到为什么停用；只写 console 又丢结构化日志。
 */
export function warnMissingCapabilities(
  ctx: { logger?: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly HostCapability[],
): boolean {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return true
  const message = disabledLine(pluginName, `缺少本插件依赖的 ${missing.join('、')}`)
  ctx.logger?.warn(message)
  console.warn(message)
  return false
}

/** 值存在且（若给定期望类型）类型相符；探针须用命名空间访问或惰性读取，避免链接期失败。 */
export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}
