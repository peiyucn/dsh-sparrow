/**
 * 宿主兼容自检（根 AGENTS《扩展与宿主兼容》）—— 纯能力版：本插件不读会话数据，无会话格式门。
 * **门只装在 client half，且必须走不抛错的 {@link warnMissingCapabilities}**：客户端 boot 审计把
 * 「任一 entry 非 active」当致命失败（`bootClient` 抛错 → 宿主只渲染 "Failed to load plugins"）；
 * host half 没有必需服务（settings 走可选注入），故不需要门。
 */

/** 一项能力：`name` 进日志，`ok` 由调用方探测（服务 / 方法 / 导出 / 浏览器特性是否存在）。 */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/** 停用理由（两个入口共用一句，避免文案漂移）。 */
function missingReason(missing: readonly string[]): string {
  return `缺少本插件依赖的 ${missing.join('、')}`
}

/** 缺失的能力名（纯逻辑，供单测）。 */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/**
 * 面向用户的告警：cordis logger（结构化、进宿主日志面）+ `console.warn`。两条都要写 —— 客户端 `ctx.logger`
 * 只有环形缓冲 exporter、浏览器侧没有 console 通道，只写 logger 用户永远看不到为什么停用；只写 console 又
 * 丢结构化日志。只在停用 / 降级这种一次性节点上写。
 */
export function warnUser(
  ctx: { logger?: { warn(message: string): void } },
  message: string,
): void {
  // logger 缺失也要能告警：console 是无条件的那条通道。
  ctx.logger?.warn(message)
  console.warn(message)
}

/**
 * 客户端侧能力门：任一必需能力缺失即**惰性停用** —— 记一条面向用户告警并返回 false，**绝不抛错**，由调用方
 * 直接 `return`（不注册任何槽位 / 样式 / 监听）。`inject` 只允许放跨版本稳定存在的服务，易变面（设置读取面）
 * 另走可选依赖 fork，缺了只是不装。
 */
export function warnMissingCapabilities(
  ctx: { logger?: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly HostCapability[],
): boolean {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return true
  warnUser(ctx, `${pluginName}: ${missingReason(missing)}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`)
  return false
}

/** 无 `CSS.supports`（非浏览器运行 / 老引擎）时返回 false —— 视为缺能力。 */
export function cssSupports(probe: string): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  try {
    return CSS.supports(probe)
  } catch {
    return false
  }
}

/** 值存在且（若给定期望类型）类型相符；探针须用命名空间访问 / 惰性 import，避免链接期失败。 */
export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}
