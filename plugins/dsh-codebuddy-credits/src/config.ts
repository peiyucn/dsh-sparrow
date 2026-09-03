/**
 * 插件设置节：llm-codebuddy-credits。apiKeyEnv 是凭据引用（设置页以凭据控件呈现，
 * 密钥值只经 ctx.credentials，不进设置文件）；models 覆盖内置目录（模型发现的
 * 采纳结果写在这里）。
 */

import z from '@deepseek-ai/schemastery'
import type { PiAiModelProfile, PiAiReasoningEfforts } from '@deepseek-ai/dsh-llm-pi-ai'
import { API_KEY_ENV, THINKING_LEVELS } from './constants.js'

const MODEL_MODALITIES = ['text', 'image'] as const

/** 思考档位声明：false 禁用；dict 显式声明（key 限官方档位，value 为 wire 拼写，null 表示不发参数）。 */
const reasoningEfforts = z.dict(
  z.union([z.string(), z.const(null)]),
  z.union(THINKING_LEVELS),
) as unknown as z<PiAiReasoningEfforts>

// 简化的模型条目 schema（不含官方 compat 全量字段）；断言对齐 PiAiModelProfile，
// 运行时仅校验这里声明的字段。
const modelProfile = z.object({
  id: z.string().required(),
  name: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  input: z.array(z.union(MODEL_MODALITIES)),
  reasoningEfforts: z.union([z.const(false), reasoningEfforts]),
}) as unknown as z<PiAiModelProfile>

/** 插件配置；同名 schema 兼作 llm-codebuddy-credits 设置节形状。 */
export interface Config {
  /** 凭据引用（环境变量名），默认 CODEBUDDY_API_KEY。 */
  apiKeyEnv?: string
  /** 模型列表；空（缺省）时使用内置目录。 */
  models?: PiAiModelProfile[]
}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV),
  models: z.array(modelProfile).default([]),
})
