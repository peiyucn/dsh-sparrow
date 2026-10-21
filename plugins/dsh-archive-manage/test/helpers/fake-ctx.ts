/**
 * 兼容性门用的假宿主上下文（typed fixture）。
 *
 * 类型**从本插件的 `src/compat.ts` 反推**，而不是手抄一份 `{ logger: { warn } }`：
 * 契约（形参形状）一改，这里立刻 tsc 报错，测试里的桩不会静默漂移。
 * 注意**不能**从 `lib/*.js` 取类型——那是剥掉注解的构建产物，`Parameters<typeof fn>[0]`
 * 会推成 `any`，夹具就变成假安全。
 */

import type { assertCapabilities, assertHostCompatible } from '../../src/compat.js'

/** 两个门都只碰 `logger` 这一面，取交集即夹具的最小契约。 */
export type HostLogCtx =
  & Parameters<typeof assertCapabilities>[0]
  & Parameters<typeof assertHostCompatible>[0]

/**
 * 造一个能记录告警的假宿主上下文。
 * @returns `{ ctx, warns }` —— `warns` 按调用顺序累积传给 `logger.warn` 的文案。
 */
export function fakeHostCtx(): { ctx: HostLogCtx; warns: string[] } {
  const warns: string[] = []
  return { ctx: { logger: { warn: (message: string) => { warns.push(message) } } }, warns }
}
