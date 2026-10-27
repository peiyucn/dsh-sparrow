/**
 * 会话格式自检（host half）：积分重放要**逐字段解析**事件里的 `…response.usage.credit`，
 * 格式换代可能改变事件布局——认错就是静默读出 0，故按宿主上报的版本做**软判定**。
 *
 * 与 `compat.ts` 分开的原因：本模块要 import 官方 `@deepseek-ai/dsh-session`（node 侧），
 * 而 client half 也要用 `compat.ts` 的能力门；合在一起会把 node 模块拖进浏览器 bundle。
 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'

/**
 * 本插件构建时对齐的 dsh 会话格式版本集合（与 archive-manage / chat-fim 同一集合）。
 * 官方当前格式 `4` 必须在集合内，否则每次启动都会发一条「积分可能显示为 0」的误导告警。
 */
export const SUPPORTED_SESSION_FORMAT_VERSIONS: readonly number[] = [0, 3, 4]

/**
 * 宿主上报的会话格式版本。
 * 用**命名空间访问**而非具名导入：官方删/改名该导出时这里只得到 `undefined`（判定为「未知」），
 * 而不是 ESM 链接期失败——链接期失败不在插件容器对 `apply` 的异常保护范围内。
 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}

/**
 * 会话格式是否为已知可安全处理的版本 —— **软判定**，返回原因供调用方**告警而不停用**。
 *
 * 为什么这里是软门而不是 archive-manage / chat-fim 那种抛错硬门：那两个插件的**全部功能**都建立在
 * 读会话数据上，格式不认识就该让位；本插件的**主体功能是 LLM provider**，格式不认识的坏后果只是
 * 「积分显示为 0」，为它把用户的推理能力一起停掉是明显过度的取舍。实际读不出来由 `credits-source.ts`
 * 的运行时兜底降级。
 */
export function unsupportedSessionFormatReason(
  version: unknown,
  supported: readonly number[] = SUPPORTED_SESSION_FORMAT_VERSIONS,
): string | undefined {
  if (typeof version === 'number' && supported.includes(version)) return undefined
  const shown = typeof version === 'number' ? `v${version}` : `未知（${String(version)}）`
  return `当前 dsh 的会话格式为 ${shown}，本插件仅在 ${supported.map(value => `v${value}`).join(' / ')} 上验证过积分重放`
}
