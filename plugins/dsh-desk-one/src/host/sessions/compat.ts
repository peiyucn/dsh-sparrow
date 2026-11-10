/**
 * Host compatibility self-check (root AGENTS "Plugin-host compatibility"): **self-disable** when the host contract is unrecognized; the decision and message are pure logic for unit tests.
 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'
import { disabledLine } from '../../compat.js'

// The capability gate is identical for every plugin surface, so it lives in the root module only;
// this file adds just the session-format gate on top.
export { assertCapabilities, missingCapabilities } from '../../compat.js'
export type { HostCapability } from '../../compat.js'

/**
 * Set of dsh session-format versions this plugin was built against (monotonic integers). Misjudging the format
 * costs data — the plugin moves/deletes session files at the **directory** level, so it declares only versions it
 * knows are safe to handle. Since 0.1.5 the headers returned by `list()/stat()` are already translated to the
 * current logical version by the persistence layer, so this gate judges the host-contract generation, not the
 * physical on-disk generation.
 */
export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3, 4]

/** Whether the host session format is safe to handle; when it is not, returns a reason fit for logging. */
export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅支持 ${supported.map(value => `v${value}`).join(' / ')}`
}

/**
 * Host **source-of-truth** format gate: trust the `version` on the session header the host supplies (inside the
 * plugin, `@deepseek-ai/dsh-session` may resolve to its own peer copy and a constant probe would read a stale
 * value and wrongly report compatibility; headers are produced by the host and unaffected).
 */
export function unsupportedStoredFormatReason(
  headers: readonly { readonly version?: unknown }[],
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  for (const header of headers) {
    const reason = unsupportedSessionFormatReason(header.version, supported)
    if (reason !== undefined) return `${reason}（宿主会话 header）`
  }
  return undefined
}

/**
 * Session format version reported by the host. Uses **namespace access** rather than a named import: if the official
 * side removes/renames that export, this only yields `undefined` (unsupported → self-disable) instead of an ESM
 * link-time failure (link-time failures are outside the plugin container's exception protection).
 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}

/** Startup self-check: throw (self-disable) when the host session format is outside the supported set, logging a user-facing warning first. */
export function assertHostCompatible(
  ctx: { logger: { warn(message: string): void } },
  pluginName: string,
  version: unknown = hostSessionFormatVersion(),
): void {
  const reason = unsupportedSessionFormatReason(version)
  if (reason === undefined) return
  ctx.logger.warn(disabledLine(pluginName, reason))
  throw new Error(`${pluginName}: ${reason}`)
}
