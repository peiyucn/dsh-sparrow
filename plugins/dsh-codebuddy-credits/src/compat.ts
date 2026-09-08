/**
 * 宿主兼容自检（根 AGENTS《插件与宿主兼容》）——纯能力版。
 *
 * 本插件不读 dsh 会话数据，因此没有会话格式门；守卫点是**宿主能力面**
 * （依赖的服务/方法/导出是否存在，以及运行环境特性）。不满足即抛错自停用，
 * 绝不带病运行。判定与文案是纯逻辑，供单测。
 */

/** 一项能力：`name` 进日志，`ok` 由调用方探测（服务/方法/导出/浏览器特性是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/**
 * 缺失的能力名（纯逻辑，供单测）。
 * @param capabilities - 本插件声明的能力。
 * @returns 未满足的能力名，按声明顺序。
 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/**
 * 能力门：任一必需能力缺失即抛错（自停用）。
 *
 * cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive，dsh 与其余插件不受影响
 * （已查证 cordis `lib/index.js:1350-1362`）。抛错前先记一条面向用户的告警，
 * 说明「为什么停用、怎么恢复」。
 * @param ctx - 插件上下文（只用到 logger）。
 * @param pluginName - 插件名（日志与错误前缀）。
 * @param capabilities - 本插件声明的能力。
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
