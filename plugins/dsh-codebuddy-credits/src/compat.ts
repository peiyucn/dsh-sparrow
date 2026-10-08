/**
 * 宿主兼容自检（根 AGENTS《插件与宿主兼容》）——纯能力版。
 *
 * ⚠️ **有意不设会话格式硬门**：本插件会读会话数据，但读的是只读、可降级的展示数据（积分），
 * 格式认不出时后果只是「积分显示为 0」，而自停用会让用户整个 lose 掉 LLM provider（推理也停）；
 * 故改为软降级 + 告警（见 `src/index.ts` 对 `hostSessionFormatVersion()` 的核对）。
 *
 * 下面的能力门才是本插件真正会「带病运行」的守卫点（缺了就无法注册 provider）。
 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'

/**
 * 本插件构建时对齐的 dsh 会话格式版本集合（与 archive-manage / chat-fim 同一集合）。
 * 积分重放会**逐字段解析**事件的 `…response.usage.credit`，格式换代可能改变事件布局——认错就是静默读出 0；
 * 官方当前格式 `4` 必须在集合内，否则每次启动都会发一条「积分可能显示为 0」的误导告警。
 */
export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3, 4]

/**
 * 宿主上报的会话格式版本。
 * 用**命名空间访问**而非具名导入：官方删/改名该导出时这里只得到 `undefined`（判定为「未知」），
 * 而不是 ESM 链接期失败——链接期失败不在插件容器对 `apply` 的异常保护范围内。
 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}

/**
 * 会话格式是否为已知可安全处理的版本 —— **软判定**，返回原因供调用方**告警而不停用**。
 *
 * 为什么这里是软门而不是 archive-manage / chat-fim 那种抛错硬门：那两个插件的**全部功能**都建立在
 * 读会话数据上，格式不认识就该让位；本插件的**主体功能是 LLM provider**，格式不认识的坏后果只是
 * 「积分显示为 0」，为它把用户的推理能力一起停掉是明显过度的取舍。实际读不出来由 `credits-source.ts`
 * 的运行时兜底降级。
 */
export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅在 ${supported.map(value => `v${value}`).join(' / ')} 上验证过积分重放`
}

/** 一项能力：`name` 进日志，`ok` 由调用方探测（服务/方法/导出/浏览器特性是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/** 缺失的能力名（纯逻辑，供单测）。 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/**
 * 能力门：任一必需能力缺失即抛错（自停用——cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive，
 * dsh 与其余插件不受影响）；抛错前先记一条面向用户的告警，说明「为什么停用、怎么恢复」。
 */
export function assertCapabilities(
  ctx: { logger: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly HostCapability[],
): void {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return
  const reason = `缺少本插件依赖的 ${missing.join('、')}`
  ctx.logger.warn(`${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`)
  throw new Error(`${pluginName}: ${reason}`)
}
