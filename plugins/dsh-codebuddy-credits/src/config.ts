/**
 * 插件设置节：llm-codebuddy-credits。形状对齐官方 llm-deepseek 的整节
 * profile：apiKeyEnv 直接在节根部（官方设置页的凭据圆点按
 * schema.getPath(namespace.value, settingsPath).apiKeyEnv 读取，整节型
 * provider 的 settingsPath 为空，apiKeyEnv 必须在根部圆点才会亮）。
 * apiKeyEnv 是凭据引用（密钥只经 ctx.credentials，不进设置文件）；
 * 模型列表不落设置节——完全由 Key 授权下的 /v3/config 决定。
 */

import z from '@deepseek-ai/schemastery'
import { API_KEY_ENV } from './constants.js'

/** 插件配置；同名 schema 兼作 llm-codebuddy-credits 设置节形状。 */
export interface Config {
  /** 凭据引用（环境变量名），默认 CODEBUDDY_CREDITS_API_KEY。 */
  apiKeyEnv?: string
}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV),
})
