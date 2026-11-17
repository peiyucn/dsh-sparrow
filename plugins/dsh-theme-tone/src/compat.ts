


export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}


function missingReason(missing: readonly string[]): string {
  return `缺少本插件依赖的 ${missing.join('、')}`
}


export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}


export function warnUser(
  ctx: { logger?: { warn(message: string): void } },
  message: string,
): void {

  ctx.logger?.warn(message)
  console.warn(message)
}


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


export function cssSupports(probe: string): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  try {
    return CSS.supports(probe)
  } catch {
    return false
  }
}


export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}
