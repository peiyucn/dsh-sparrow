


interface ClientCapability {
  readonly name: string
  readonly ok: boolean
}


export function missingCapabilities(capabilities: readonly ClientCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}


function warnUser(ctx: { logger?: { warn(message: string): void } }, message: string): void {
  ctx.logger?.warn(message)
  console.warn(message)
}


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


export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}
