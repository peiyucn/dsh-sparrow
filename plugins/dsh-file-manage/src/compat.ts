/**
 * 宿主兼容自检：host half 缺能力即抛错自停用；client half 只告警并返回 false（客户端 boot 审计把非 active
 * entry 当致命失败，抛错会让整页加载不出来）。判定与文案是纯逻辑，供单测。
 */

/** 一项能力：`name` 进日志，`ok` 由调用方探测（服务/方法/导出/浏览器特性是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/** 缺失的能力名，按声明顺序（纯逻辑，供单测）。 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

function disabledLine(pluginName: string, reason: string): string {
  return `${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`
}

/** host 能力门：任一必需能力缺失即抛错（cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive）。 */
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

/** client 能力门：缺失即告警并返回 false，调用方直接 return（不注册槽位 / 样式 / 监听，绝不抛错）。 */
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

/** 惰性探针：属性 / 方法缺失或抛错都算缺能力（不产生链接期失败）。 */
export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}
