/**
 * dsh-theme-tone host half：导出 `Config`（色调选择的 schema），让色调选择进 profile 配置、
 * 由官方设置面持久化。渲染与读取全在 client half（经 `ctx.configForms`）。
 *
 * 与官方 ui-theme 的分工一致：宿主侧不持有值。`settings` 仍是**可选服务** ——
 * 组合里没有它时插件照常加载，只是选择无法持久化（客户端降级为进程内状态）。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { name } from './constants.js'
import { Config } from './settings-schema.js'

export { name, Config }

/** 宿主侧不依赖任何必需服务（`settings` 走可选注入）。 */
export const inject: string[] = []

/**
 * 注册本插件的设置页策略。官方 0.1.7 起设置表单由插件导出的 {@link Config} 自动投影，
 * 而本插件自带「设置 → 常规 → 色调」行（`settings.general.item` 槽位），
 * 故关掉自动生成的配置页，避免同一份值在两个界面里编辑。
 *
 * `settings` 是可选服务：`ctx.inject` 起的 fork 在它缺席时一直挂着，插件其余部分不受影响
 * （不会让 entry 停在 pending，见根 AGENTS《扩展与宿主兼容》）。
 * @param ctx - 宿主侧 Cordis 上下文。
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      `${name}: settings page policy`,
    )
  })
}
