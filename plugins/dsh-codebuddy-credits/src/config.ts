/**
 * 插件设置节：llm-codebuddy-credits。形状对齐官方 llm-deepseek 的整节
 * profile：apiKeyEnv 直接在节根部（官方设置页的凭据圆点按
 * schema.getPath(namespace.value, settingsPath).apiKeyEnv 读取，整节型
 * provider 的 settingsPath 为空，apiKeyEnv 必须在根部圆点才会亮）。
 * apiKeyEnv 是凭据引用（密钥只经 ctx.credentials，不进设置文件）；
 * 模型列表不落设置节——完全由 Key 授权下的 /v3/config 决定。
 */

import z from '@deepseek-ai/schemastery'
import { API_KEY_ENV, LEGACY_API_KEY_ENV } from './constants.js'

/** 插件配置；同名 schema 兼作 llm-codebuddy-credits 设置节形状。 */
export interface Config {
  /** 凭据引用（环境变量名），默认 CODEBUDDY_CREDITS_API_KEY。 */
  apiKeyEnv?: string
}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV),
})

/**
 * 解析 Key 时依次尝试的凭据引用（纯函数，供单测）：
 * 用户配置的 apiKeyEnv 优先（默认对齐官方派生名 CODEBUDDY_CREDITS_API_KEY），
 * 旧引用 CODEBUDDY_API_KEY 兜底（旧版存过的 Key 不用重配）；两者同名时去重。
 */
export function keyRefs(config: Config): readonly string[] {
  const primary = config.apiKeyEnv ?? API_KEY_ENV
  const refs = [primary, LEGACY_API_KEY_ENV]
  return refs.filter((ref, index) => refs.indexOf(ref) === index)
}
