

import * as dshSessionSurface from '@deepseek-ai/dsh-session'
import { disabledLine } from '../../compat.js'



export { assertCapabilities, missingCapabilities } from '../../compat.js'
export type { HostCapability } from '../../compat.js'


export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3, 4]


export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅支持 ${supported.map(value => `v${value}`).join(' / ')}`
}


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


export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}


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
