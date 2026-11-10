/**
 * Client-half capability gate (non-throwing variant): DSH Web's boot audit treats **any non-active client entry**
 * as a fatal failure (the host page renders only "Failed to load plugins"), so a missing client capability may
 * only warn and lazily disable — it must never throw.
 */

/** One capability: `name` goes into logs, `ok` is probed by the caller. */
interface ClientCapability {
  readonly name: string
  readonly ok: boolean
}

/** Names of the missing capabilities (pure logic, for unit tests). */
export function missingCapabilities(capabilities: readonly ClientCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/** User-facing warning: cordis logger + `console.warn` (the only visible channel on the browser side). */
function warnUser(ctx: { logger?: { warn(message: string): void } }, message: string): void {
  ctx.logger?.warn(message)
  console.warn(message)
}

/** Client capability gate: warn and return false when anything is missing; the caller just returns (registers no slot / style / listener). */
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

/** Lazy probe: a missing property / method or a throw both count as a missing capability (never a link-time failure). */
export function hasCapability(probe: () => unknown, expectedType = 'function'): boolean {
  try {
    return typeof probe() === expectedType
  } catch {
    return false
  }
}
