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
 * 宿主上报的会话格式版本。
 *
 * 用**命名空间访问**而非具名导入：官方若删除/改名该导出，这里只得到 `undefined`
 * （判定为「未知 → 不支持 → 自停用」），而不是 ESM 链接期失败——链接期失败发生在
 * 模块加载阶段，不在插件容器对 `apply` 的异常保护范围内。
 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
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
  ctx.logger.warn(`${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件后自动恢复）`)
  throw new Error(`${pluginName}: ${reason}`)
}
