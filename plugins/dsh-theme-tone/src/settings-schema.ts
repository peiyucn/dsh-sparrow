/**
 * 插件的 Cordis `Config`（**宿主侧专用**）：单独成模块是为了让 schemastery（宿主侧依赖）不进客户端
 * bundle（客户端会内联 `tones.ts`）。两个字段必须 `.volatile()` 才进可读写设置表单；命名空间 = profile 条目 id。
 */

import z from '@deepseek-ai/schemastery'
import { DARK_TONE_IDS, DEFAULT_SETTINGS, LIGHT_TONE_IDS } from './tones.js'

/** 色调选择的持久化 schema（Cordis 按同名导出识别插件配置）。 */
export const Config = z.object({
  lightTone: z.union([...LIGHT_TONE_IDS]).default(DEFAULT_SETTINGS.lightTone).volatile(),
  darkTone: z.union([...DARK_TONE_IDS]).default(DEFAULT_SETTINGS.darkTone).volatile(),
})
