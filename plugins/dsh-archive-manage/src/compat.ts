/**
 * 宿主兼容自检（根 AGENTS《插件与宿主兼容》）：宿主契约不认识时**自停用**，判定与文案是纯逻辑，供单测。
 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'

/**
 * 本插件构建时对齐的 dsh 会话格式版本集合（单调整数）。认错格式的代价是丢数据 —— 本插件按**目录**
 * 移动/删除会话文件，故只声明已知可安全处理的版本。0.1.5 起 `list()/stat()` 返回的 header 已被
 * 持久化层翻译成当前逻辑版本，本门判的是「宿主契约代」而非磁盘物理代。
 */
export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3, 4]

/** 面向日志/错误的统一停用前缀。 */
function disabledLine(pluginName: string, reason: string): string {
  return `${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`
}

/** 宿主会话格式是否可安全处理；不可时返回可直接进日志的原因。 */
export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅支持 ${supported.map(value => `v${value}`).join(' / ')}`
}

/**
 * 宿主**真值**格式门：以宿主给出的会话 header 的 `version` 为准（插件里的 `@deepseek-ai/dsh-session`
 * 可能解析到自己的 peer 副本、常量探针读到旧值而误判兼容；header 由宿主产生，不受影响）。
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

/**
 * 宿主上报的会话格式版本。用**命名空间访问**而非具名导入：官方删除/改名该导出时这里只得到 `undefined`
 * （不支持 → 自停用），而不是 ESM 链接期失败（链接期失败不在插件容器的异常保护范围内）。
 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}

/** 一项宿主能力：`name` 进日志，`ok` 由调用方探测（服务/方法/导出是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/** 缺失的能力名，按声明顺序（纯逻辑，供单测）。 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/**
 * 能力门：宿主缺少任一必需能力即抛错（自停用）—— cordis 逐插件捕获 `apply` 异常并标 inactive，
 * 抛错前先记一条面向用户的告警（为什么停用、怎么恢复）。
 */
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

/** 启动自检：宿主会话格式不在支持集合内即抛错（自停用），抛错前先记面向用户的告警。 */
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
