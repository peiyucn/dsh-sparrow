/**
 * 宿主兼容自检（根 AGENTS《插件与宿主兼容》）——纯能力模块，**不 import 任何官方运行时包**：
 * host half 用抛错版（缺失即自停用），client half 用不抛错版（告警 + 返回 false）。
 *
 * 会话格式的软判定在 `session-format.ts`（它要 import 官方 dsh-session；放这里会把 node
 * 模块拖进浏览器 bundle）。本插件有意**不设会话格式硬门**：积分只是展示面，格式认不出时
 * 后果只是「积分显示为 0」，为此停掉用户的推理 provider 是过度取舍。
 */

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

/**
 * 客户端侧能力门：任一必需能力缺失即**惰性停用**——记一条面向用户告警并返回 false，**绝不抛错**。
 *
 * 为什么与 `assertCapabilities` 两套：DSH Web 的客户端 boot 审计把**任一 client entry 非 active**
 * 当致命失败（`bootClient` 抛错 → 整页只渲染 "Failed to load plugins"），故 client half 不能用抛错版，
 * 只能由调用方在 false 时直接 `return`（不注册任何槽位 / 样式 / 监听）。
 */
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

/** 值存在且（若给定期望类型）类型相符；探针须用命名空间访问 / 惰性 import，避免链接期失败。 */
export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}

/** 官方注册 API 的「同名已被占用」错误码前缀（`DUPLICATE_ADAPTER` / `DUPLICATE_DIRECTORY` / `DUPLICATE_DISCOVERY`）。 */
const DUPLICATE_REGISTRATION_PREFIX = 'DUPLICATE_'

/** 注册冲突的官方错误码；不是冲突（或形状不对）时 undefined。纯逻辑，供单测。 */
export function duplicateRegistrationCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.startsWith(DUPLICATE_REGISTRATION_PREFIX) ? code : undefined
}

/**
 * 注册失败的处理：冲突（他插件已占用同名 provider / settingsNs）只告警并跳过本插件的这次注册，
 * **绝不清理别人的注册**；其余错误照常记日志后继续——`apply` 不能因为一次注册失败裸抛，
 * 否则整个插件（含仍可工作的 provider / 积分面）都会停用。
 */
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
