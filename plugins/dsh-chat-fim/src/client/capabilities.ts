/**
 * client half 的必需能力表（纯逻辑，不碰 DOM / React）：`apply` 用 {@link warnMissingCapabilities} 跑它，
 * 缺任一即整体不装。探针按**实际使用面**取值：三个槽位注册要 slots.inject / register，声明 `locale:` 的
 * 槽位由渲染器经 locale.bind 取 `t`、字典注册要 locale.register，会话 scope 要 sessions.scope。
 */

import { hasCapability, type HostCapability } from '../compat.js'

/** 宿主 ctx 的最小面：只读探针，不调用任何服务。 */
export interface ClientCapabilityHost {
  readonly slots?: { readonly inject?: unknown; readonly register?: unknown }
  readonly locale?: { readonly register?: unknown; readonly bind?: unknown }
  readonly sessions?: { readonly scope?: unknown }
}

/** 本插件 client half 的必需能力（顺序即告警里的顺序）。 */
export function clientCapabilities(host: ClientCapabilityHost): HostCapability[] {
  return [
    { name: 'ctx.slots.inject', ok: hasCapability(() => host.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => host.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => host.locale?.register) },
    { name: 'ctx.locale.bind', ok: hasCapability(() => host.locale?.bind) },
    { name: 'ctx.sessions.scope', ok: hasCapability(() => host.sessions?.scope) },
  ]
}
