/**
 * 插件设置节：llm-codebuddy-credits。形状对齐官方 llm-pi-ai 的 providers dict：
 * settings 里 providers.codebuddy-credits 存在 = 用户主动添加了这个 provider（route
 * 生效）；删除 = route 消失（dormant）。apiKeyEnv 是凭据引用（密钥只经
 * ctx.credentials，不进设置文件）；models 覆盖模型目录（保存 Key 时拉取的结果）。
 */

import z from '@deepseek-ai/schemastery'
import type { CodeBuddyModelProfile } from './catalog.js'
import { API_KEY_ENV, THINKING_LEVELS } from './constants.js'

const MODEL_MODALITIES = ['text', 'image'] as const

/** 思考档位声明：false 禁用；dict 显式声明（key 限官方档位，value 为 wire 拼写，null 表示不发参数）。 */
const reasoningEfforts = z.dict(
  z.union([z.string(), z.const(null)]),
  z.union(THINKING_LEVELS),
) as unknown as z<CodeBuddyModelProfile['reasoningEfforts']>

// 简化的模型条目 schema；断言对齐 CodeBuddyModelProfile，运行时仅校验这里声明的字段。
const modelProfile = z.object({
  id: z.string().required(),
  name: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  input: z.array(z.union(MODEL_MODALITIES)),
  reasoningEfforts: z.union([z.const(false), reasoningEfforts]),
}) as unknown as z<CodeBuddyModelProfile>

/** 一条 provider 路由配置（settings 里 providers.<provider> 的值）。 */
export interface ProviderConfig {
  /** 凭据引用（环境变量名），默认 CODEBUDDY_API_KEY。 */
  apiKeyEnv?: string
  /** 模型列表；空（缺省）时无模型（用户未给 Key 的正常姿态）。 */
  models?: CodeBuddyModelProfile[]
}

/** 插件配置；同名 schema 兼作 llm-codebuddy-credits 设置节形状。 */
export interface Config {
  providers?: Record<string, ProviderConfig>
}

export const Config: z<Config> = z.object({
  providers: z.dict(z.object({
    apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV),
    models: z.array(modelProfile).default([]),
  })).default({}),
})
