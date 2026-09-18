/**
 * dsh-theme-tone host half：只注册 settings 命名空间，让色调选择可持久化、可描述。
 *
 * 渲染与读取全在 client half（经 `ctx.settingsScope`），宿主侧不持有值 ——
 * 与官方 ui-theme 的分工一致（`ui-theme/src/index.ts:36-44`）。
 * settings 是可选服务：组合里没有它时插件照常加载，只是选择无法持久化。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { SETTINGS_NAMESPACE, name } from './constants.js'
import { ThemeToneSettingsSchema } from './settings-schema.js'

export { name }

/** 宿主侧不依赖任何必需服务（settings 走可选注入）。 */
export const inject: string[] = []

/**
 * 注册色调命名空间。`ctx.inject` 在 settings 服务出现时触发；服务缺席时不注册，
 * 客户端侧自动降级为进程内状态（进程重启即回默认）。
 * @param ctx - 宿主侧 Cordis 上下文。
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NAMESPACE, ThemeToneSettingsSchema)
  })
}
