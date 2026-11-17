

import * as dshSessionSurface from '@deepseek-ai/dsh-session'


export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3, 4]


export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}


export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅在 ${supported.map(value => `v${value}`).join(' / ')} 上验证过积分重放`
}
