/** 配置面：默认值与归一化。纯逻辑、无 Node / 浏览器依赖，host 与 client 都能 import。 */

import { DEFAULT_MAX_BODY_BYTES, DEFAULT_REQUEST_TIMEOUT_MS } from './constants.js'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/beta'
export const DEFAULT_MODEL = 'deepseek-flash'
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
export const DEFAULT_MAX_PROMPT_CHARS = 32_768
export const DEFAULT_MAX_TOKENS = 96
export const DEFAULT_SUGGESTION_COUNT = 1
/** 默认采样温度 0.3：temp=1 漂移明显、会复读历史消息。 */
export const DEFAULT_TEMPERATURE = 0.3

export interface ChatFimConfig {
  readonly baseURL: string
  readonly model: string
  readonly maxTokens: number
  readonly apiKeyEnv: string
  readonly requestTimeoutMs: number
  readonly maxBodyBytes: number
  readonly maxPromptChars: number
  readonly suggestionCount: number
  readonly temperature: number
}

/** 把外部配置补成完整内部配置；非法数字一律拒绝（插件加载期即失败，而不是请求期）。 */
export function normalizeConfig(input: Readonly<Partial<ChatFimConfig>> | undefined): ChatFimConfig {
  const config: ChatFimConfig = {
    baseURL: input?.baseURL?.trim() || DEFAULT_BASE_URL,
    model: input?.model?.trim() || DEFAULT_MODEL,
    maxTokens: input?.maxTokens ?? DEFAULT_MAX_TOKENS,
    apiKeyEnv: input?.apiKeyEnv?.trim() || DEFAULT_API_KEY_ENV,
    requestTimeoutMs: input?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxBodyBytes: input?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    maxPromptChars: input?.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS,
    suggestionCount: input?.suggestionCount ?? DEFAULT_SUGGESTION_COUNT,
    temperature: input?.temperature ?? DEFAULT_TEMPERATURE,
  }
  if (config.baseURL === '' || config.model === '' || config.apiKeyEnv === '') {
    throw new Error('dsh-chat-fim: baseURL/model/apiKeyEnv 不能为空')
  }
  for (const [name, value] of Object.entries({
    maxTokens: config.maxTokens,
    requestTimeoutMs: config.requestTimeoutMs,
    maxBodyBytes: config.maxBodyBytes,
    maxPromptChars: config.maxPromptChars,
    suggestionCount: config.suggestionCount,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`dsh-chat-fim: ${name} 必须是正整数`)
    }
  }
  if (config.suggestionCount > 4) {
    throw new Error('dsh-chat-fim: suggestionCount 不能超过 4')
  }
  if (typeof config.temperature !== 'number' || !Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) {
    throw new Error('dsh-chat-fim: temperature 必须是 0-2 之间的数字')
  }
  if (!/^https?:\/\//u.test(config.baseURL)) {
    throw new Error('dsh-chat-fim: baseURL 必须是 http(s) URL')
  }
  return config
}
