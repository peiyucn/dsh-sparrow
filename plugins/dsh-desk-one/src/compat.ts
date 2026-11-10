/**
 * Host-half compatibility self-check (root AGENTS "Plugin-host compatibility"): **self-disable** when the host
 * contract is unrecognized; the decision and message are pure logic for unit tests. The client half uses the
 * non-throwing variant in `client/compat.ts`.
 */

/** One host capability: `name` goes into logs, `ok` is probed by the caller (whether the service / method / export exists). */
export interface HostCapability {
  readonly name: string
  readonly ok: boolean
}

/** Names of the missing capabilities, in declaration order (pure logic, for unit tests). */
export function missingCapabilities(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter(capability => !capability.ok).map(capability => capability.name)
}

/** Unified disable prefix for logs / errors; the session-format gate reuses the same wording. */
export function disabledLine(pluginName: string, reason: string): string {
  return `${pluginName}: ${reason}；已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）`
}

/**
 * Capability gate: throw when the host lacks any required capability (self-disable) — cordis catches `apply`
 * exceptions per plugin and marks it inactive; log a user-facing warning before throwing (why it disabled,
 * how to recover).
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
