/**
 * host half 的宿主兼容自检（根 AGENTS《插件与宿主兼容》）：宿主契约不认识时**自停用**，
 * 判定与文案是纯逻辑，供单测。client half 用 `client/compat.ts` 的不抛错版。
 */

/** 一项宿主能力：`name` 进日志，`ok` 由调用方探测（服务 / 方法 / 导出是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/** 缺失的能力名，按声明顺序（纯逻辑，供单测）。 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/** 面向日志 / 错误的统一停用前缀。 */
function disabledLine(pluginName: string, reason: string): string {
  return `${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`
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
