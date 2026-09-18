/**
 * settings 命名空间的 schema（**宿主侧专用**）。
 *
 * 单独成模块的原因：客户端 bundle 会内联 `tones.ts`，而 schemastery 是宿主侧
 * 依赖 —— 让 schema 与色调表分离，schemastery 就永远不会被打进浏览器产物。
 */

import z from '@deepseek-ai/schemastery'
import { DARK_TONE_IDS, DEFAULT_SETTINGS, LIGHT_TONE_IDS, type ThemeToneSettings } from './tones.js'

/**
 * 色调选择的持久化 schema。字段是可枚举的色调 id，默认值即 {@link DEFAULT_SETTINGS} ——
 * 非法存量值在注册时就被 schema 判掉，不会流到渲染层。
 */
export const ThemeToneSettingsSchema: z<ThemeToneSettings> = z.object({
  lightTone: z.union([...LIGHT_TONE_IDS]).default(DEFAULT_SETTINGS.lightTone),
  darkTone: z.union([...DARK_TONE_IDS]).default(DEFAULT_SETTINGS.darkTone),
})
