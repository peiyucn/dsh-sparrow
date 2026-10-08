/** 宿主兼容自检：宿主契约不认识时自停用（告警 + 抛错），绝不拖垮 dsh；判定与文案是纯逻辑，供单测。 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'

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

/** 用**命名空间访问**而非具名导入：官方若删除/改名该导出，这里只得到 `undefined`（判为不支持 → 自停用），而不是 ESM 链接期失败——链接期失败不在插件容器对 `apply` 的异常保护范围内。 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
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
 */
export function assertHostCompatible(
  ctx: { logger: { warn(message: string): void } },
  pluginName: string,
  version: unknown = hostSessionFormatVersion(),
): void {
  const reason = unsupportedSessionFormatReason(version)
  if (reason === undefined) return
  ctx.logger.warn(disabledLine(pluginName, reason))
  throw new Error(`${pluginName}: ${reason}`)
}
