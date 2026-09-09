/**
 * 宿主兼容自检（根 AGENTS《插件与宿主兼容》）。
 *
 * 插件必须比宿主更抗造：宿主契约不认识时**自停用**，绝不拖垮 dsh、绝不在
 * 不认识的契约上执行不可逆操作。判定与文案是纯逻辑，供单测。
 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'

/**
 * 本插件构建时对齐的 dsh 会话格式版本。
 *
 * 官方会话格式是单调整数（0.1.2-rc.1 为 `0`，0.1.5-alpha.1 为 `3`），每次
 * 升级都可能改变日志布局与事件语义。本插件按**目录**移动/删除会话文件，
 * 认错格式的代价是丢数据，因此只声明已知可安全处理的版本。
 */
export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0]

/** 面向日志/错误的统一停用前缀。 */
function disabledLine(pluginName: string, reason: string): string {
  return `${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`
}

/**
 * 宿主会话格式是否可安全处理；不可时返回可直接进日志的原因。
 * @param version - 宿主上报的 `SESSION_FORMAT_VERSION`（非数字等未知形状一律按不支持处理）。
 * @param supported - 本插件支持的版本集合（默认 {@link SUPPORTED_SESSION_FORMAT_VERSIONS}）。
 * @returns 支持时 `undefined`；否则一句原因文案。
 */
export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅支持 ${supported.map(value => `v${value}`).join(' / ')}`
}

/**
 * 宿主**真值**格式门：宿主给出的会话 header 自带 `version`（由宿主的持久化层翻译后
 * 给出），与「插件解析到哪份官方包」无关。
 *
 * 为什么需要它：插件里的 `import '@deepseek-ai/dsh-session'` 可能解析到**插件自己的**
 * peer/开发依赖副本（`link:` 形态、或 npm 按 `^旧范围` 为插件补装的 peer），此时
 * {@link hostSessionFormatVersion} 读到的是旧值，常量探针会误判为兼容。header 由宿主
 * 产生，是唯一不受该问题影响的信号。
 * @param headers - 宿主给出的会话 header（`sessionPersistence.list()` 结果或 live `session.header`）。
 * @param supported - 本插件支持的版本集合（默认 {@link SUPPORTED_SESSION_FORMAT_VERSIONS}）。
 * @returns 任一 header 版本不受支持时返回原因；全部支持（或列表为空）时 `undefined`。
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
 * 宿主上报的会话格式版本。
 *
 * 用**命名空间访问**而非具名导入：官方若删除/改名该导出，这里只得到 `undefined`
 * （判定为「未知 → 不支持 → 自停用」），而不是 ESM 链接期失败——链接期失败发生在
 * 模块加载阶段，不在插件容器对 `apply` 的异常保护范围内。
 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}

/** 一项宿主能力：`name` 进日志，`ok` 由调用方探测（服务/方法/导出是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/**
 * 缺失的能力名（纯逻辑，供单测）。
 * @param capabilities - 本插件声明的宿主能力。
 * @returns 未满足的能力名，按声明顺序。
 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/**
 * 能力门：宿主缺少任一必需能力即抛错（自停用）。
 * @param ctx - 插件上下文（只用到 logger）。
 * @param pluginName - 插件名（日志与错误前缀）。
 * @param capabilities - 本插件声明的宿主能力。
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

/**
 * 启动自检：宿主不兼容即停用本插件（抛错）。
 *
 * cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive，dsh 与其余插件不受影响
 * （已查证 cordis `lib/index.js:1350-1362`）。抛错前先记一条面向用户的告警，
 * 说明「为什么停用、怎么恢复」。
 * @param ctx - 插件上下文（只用到 logger）。
 * @param pluginName - 插件名（日志与错误前缀）。
 * @param version - 宿主会话格式版本（默认读宿主导出；注入值仅供单测）。
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
