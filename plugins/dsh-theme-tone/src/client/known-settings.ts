/**
 * **已知设置的客户端副本**（localStorage）—— 一个纯兜底：宿主 `configForms` 的 describe 镜像可能
 * 长时间停在 `idle`/`loading`（首次 describe 失败后只有 `settings/document-updated` 或重连才会重试），
 * 这期间本插件此前的口径是「未就绪 ⇒ 不画」，观感就是**样式退回官方**，而设置行用进程内兜底值
 * （深轴 violet）渲染出「咱们的主题仍然选中」—— owner 报障：「样式总自己变回官方样式，但打开设置
 * 还是选中的咱们的主题，同时还会变回来」。
 *
 * 对策：把**最后一次真正的宿主值**记在 localStorage 里，冷加载时首帧就按它上色；等 describe 就绪后
 * 用权威值覆盖（两者一致时只是一次比较）。这样既能保持「官方默认 = 不画」的硬契约（用户选官方时
 * 记下的就是 official），又不会因为设置面一次失败就退回官方外观。
 *
 * ⚠️ 这里**只存用户选过的持久值**，不存默认值：第一次加载（从没就绪过）仍然不画 —— 那是正确的保守侧。
 */

import { availableToneIds, type ThemeToneSettings, type ToneId } from '../tones.js'

/** localStorage 键（本插件私有命名空间；卸载后残留无害，下次安装继续用）。 */
export const KNOWN_SETTINGS_STORAGE_KEY = 'dsh-theme-tone:last-known-settings'

/** 存储面最小接口（便于单测注入；浏览器传 `window.localStorage` 即可）。 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * 解析并**校验**一份存档：两个字段都必须是当前该轴可用的色调 id。
 * @param raw - localStorage 里读到的原始字符串（可能为 null / 脏数据）。
 * @returns 合法设置；任何一处不合法都返回 null（宁可回退「不画」，也不画一个不存在的色调）。
 */
export function parseKnownSettings(raw: string | null): ThemeToneSettings | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const lightTone = record.lightTone
    const darkTone = record.darkTone
    if (typeof lightTone !== 'string' || typeof darkTone !== 'string') return null
    if (!availableToneIds('light').includes(lightTone as ToneId)) return null
    if (!availableToneIds('dark').includes(darkTone as ToneId)) return null
    return { lightTone: lightTone as ThemeToneSettings['lightTone'], darkTone: darkTone as ThemeToneSettings['darkTone'] }
  } catch {
    return null
  }
}

/**
 * 读已知设置；localStorage 不可用（隐私模式 / 配额 / 被禁用）时返回 null。
 * @param storage - 存储面。
 * @param key - 存储键（测试可覆盖）。
 * @returns 合法存档或 null。
 */
export function readKnownSettings(storage: KeyValueStorage, key: string = KNOWN_SETTINGS_STORAGE_KEY): ThemeToneSettings | null {
  try {
    return parseKnownSettings(storage.getItem(key))
  } catch {
    return null
  }
}

/**
 * 记住一份**来自宿主**的持久值；写失败静默（只影响下次冷加载的兜底，不影响本次会话）。
 * @param storage - 存储面。
 * @param settings - 权威设置。
 * @param key - 存储键（测试可覆盖）。
 */
export function rememberKnownSettings(storage: KeyValueStorage, settings: ThemeToneSettings, key: string = KNOWN_SETTINGS_STORAGE_KEY): void {
  try {
    storage.setItem(key, JSON.stringify({ lightTone: settings.lightTone, darkTone: settings.darkTone }))
  } catch {
    // 隐私模式 / 配额满：本次会话照常，冷加载少一份兜底。
  }
}
