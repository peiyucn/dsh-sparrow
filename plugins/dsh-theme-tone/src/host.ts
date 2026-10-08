/**
 * dsh-theme-tone host half：导出 `Config` 让色调选择进 profile 配置并由官方设置面持久化，渲染与读取全在
 * client half。`settings` 是**可选服务** —— 组合里没有它时插件照常加载，只是选择无法持久化。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { name } from './constants.js'
import { Config } from './settings-schema.js'

export { name, Config }

/** 无必需服务（`settings` 走可选注入）。 */
export const inject: string[] = []

/**
 * 关掉 `Config` 自动投影出的配置页：本插件自带「设置 → 常规 → 色调」行（`settings.general.item` 槽位），
 * 否则同一份值会在两个界面里编辑。`settings` 缺席时该 fork 一直挂着，插件其余部分不受影响。
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      `${name}: settings page policy`,
    )
  })
}
