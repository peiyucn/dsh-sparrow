


export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}


export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}


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


export function warnMissingCapabilities(
  ctx: { logger?: { warn(message: string): void } },
  pluginName: string,
  capabilities: readonly HostCapability[],
): boolean {
  const missing = missingCapabilities(capabilities)
  if (missing.length === 0) return true
  const message = `${pluginName}: 缺少本插件依赖的 ${missing.join('、')}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`
  ctx.logger?.warn(message)
  console.warn(message)
  return false
}


export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}


const DUPLICATE_REGISTRATION_PREFIX = 'DUPLICATE_'


export function duplicateRegistrationCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.startsWith(DUPLICATE_REGISTRATION_PREFIX) ? code : undefined
}


export function warnRegistrationFailure(
  ctx: { logger?: { warn(message: unknown): void } },
  pluginName: string,
  what: string,
  error: unknown,
): void {
  const code = duplicateRegistrationCode(error)
  if (code !== undefined) {
    const message = `${pluginName}: ${what} 已被其他插件注册（${code}）；本插件跳过该注册，也不会清理其他插件的注册`
    ctx.logger?.warn(message)
    console.warn(message)
    return
  }
  ctx.logger?.warn(`${pluginName}: ${what} 注册失败（继续运行；相关功能可能暂不可用）`)
  ctx.logger?.warn(error)
}
