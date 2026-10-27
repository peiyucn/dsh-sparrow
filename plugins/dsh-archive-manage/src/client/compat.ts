/**
 * client half 的能力门（不抛错版）：DSH Web 的 boot 审计把**任一 client entry 非 active** 当致命
 * 失败（`bootClient` 抛 `web boot: N entry did not activate`，宿主整页只渲染 "Failed to load
 * plugins"），故 client 侧缺能力只能告警 + 惰性停用，绝不能抛错。host half 用 `../compat.ts`
 * 的抛错版（cordis 会逐插件捕获 apply 异常并标 inactive，dsh 与其余插件不受影响）。
 */

/** 一项能力：`name` 进日志，`ok` 由调用方探测（服务 / 方法 / 浏览器特性是否存在）。 */
export interface ClientCapability {
  readonly name: string
  readonly ok: boolean
}

/** 缺失的能力名（纯逻辑，供单测）。 */
export function missingCapabilities(capabilities: readonly ClientCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/** 面向用户的告警：cordis logger（结构化、进宿主日志面）+ `console.warn`（浏览器侧唯一可见通道）。 */
function warnUser(ctx: { logger?: { warn(message: string): void } }, message: string): void {
  ctx.logger?.warn(message)
  console.warn(message)
}

/** client 能力门：缺失即告警并返回 false，调用方直接 return（不注册任何槽位 / 样式 / 监听）。 */
export function warnMissingCapabilities(
  ctx: { logger?: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly ClientCapability[],
): boolean {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return true
  warnUser(ctx, `${pluginName}: 缺少本插件依赖的 ${missing.join('、')}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`)
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
