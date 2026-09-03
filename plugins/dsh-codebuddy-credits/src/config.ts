/**
 * 插件设置节：llm-codebuddy-credits。形状对齐官方 llm-deepseek 的最小
 * provider 节：providers.codebuddy-credits 存在 = 用户主动添加了这个 provider
 * （route 生效）；删除 = route 消失（dormant）。apiKeyEnv 是凭据引用（密钥只经
 * ctx.credentials，不进设置文件）。模型列表不落设置节——完全由 Key 授权下的
 * /v3/config 决定，设置页不自建模型列表（对齐 DeepSeek 的交互：只有 Key）。
 */

import z from '@deepseek-ai/schemastery'
import { API_KEY_ENV } from './constants.js'

/** 一条 provider 路由配置（settings 里 providers.<provider> 的值）。 */
export interface ProviderConfig {
  /** 凭据引用（环境变量名），默认 CODEBUDDY_API_KEY。 */
  apiKeyEnv?: string
}

/** 插件配置；同名 schema 兼作 llm-codebuddy-credits 设置节形状。 */
export interface Config {
  providers?: Record<string, ProviderConfig>
}

export const Config: z<Config> = z.object({
  providers: z.dict(z.object({
    apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV),
  })).default({}),
})
