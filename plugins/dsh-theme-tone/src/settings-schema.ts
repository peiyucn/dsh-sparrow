/**
 * 插件的 Cordis `Config`（**宿主侧专用**）。
 *
 * 单独成模块的原因：客户端 bundle 会内联 `tones.ts`，而 schemastery 是宿主侧
 * 依赖 —— 让 schema 与色调表分离，schemastery 就永远不会被打进浏览器产物。
 *
 * 官方 0.1.7 起设置不再由插件自注册命名空间：表单由插件导出的 `Config` 投影，
 * 命名空间就是 **profile 条目 id**（本插件 = `dsh-theme-tone`）。两个字段都标
 * `.volatile()`——只有 volatile 字段会进可读写的设置表单；默认值即
 * {@link DEFAULT_SETTINGS}，非法存量值在投影时就被 schema 判掉，不会流到渲染层。
 */

import z from '@deepseek-ai/schemastery'
import { DARK_TONE_IDS, DEFAULT_SETTINGS, LIGHT_TONE_IDS } from './tones.js'

/** 色调选择的持久化 schema（Cordis 按同名导出识别插件配置）。 */
export const Config = z.object({
  lightTone: z.union([...LIGHT_TONE_IDS]).default(DEFAULT_SETTINGS.lightTone).volatile(),
  darkTone: z.union([...DARK_TONE_IDS]).default(DEFAULT_SETTINGS.darkTone).volatile(),
})
