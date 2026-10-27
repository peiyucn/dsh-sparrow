/** 连接事实解析：官方 llm-deepseek 设置节 → ctx.credentials → 环境回退（与官方 adapter 同路径）。 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { DEFAULT_API_KEY_ENV, LLM_DEEPSEEK_NS } from './constants.js'
import { resolveBaseURL } from './files.js'
import { FileManageError } from './http.js'
import type { DeepSeekSurface } from './surface.js'

export interface Connection {
  baseURL: string
  apiKey: string
}

/** 只读官方 llm-deepseek 设置节的 baseURL / apiKeyEnv；字段缺失回退官方默认。 */
function readLlmDeepseekSection(ctx: Context): { baseURL?: string; apiKeyEnv?: string } {
  const descriptor = ctx.settings.describe().find(item => item.ns === LLM_DEEPSEEK_NS)
  const value = descriptor?.value as { baseURL?: unknown; apiKeyEnv?: unknown } | undefined
  return {
    ...typeof value?.baseURL === 'string' && value.baseURL !== '' ? { baseURL: value.baseURL } : {},
    ...typeof value?.apiKeyEnv === 'string' && value.apiKeyEnv !== '' ? { apiKeyEnv: value.apiKeyEnv } : {},
  }
}

/** 每请求解析一次连接事实；凭据只经 ctx.credentials，不落日志、不进浏览器。 */
export async function resolveConnection(ctx: Context, surface: DeepSeekSurface): Promise<Connection> {
  const section = readLlmDeepseekSection(ctx)
  const baseURL = resolveBaseURL(section.baseURL, process.env.DEEPSEEK_BASE_URL, surface.PUBLIC_BASE_URL)
  const apiKeyEnv = section.apiKeyEnv ?? DEFAULT_API_KEY_ENV
  let credential
  try {
    credential = await ctx.credentials.resolve(credentialRef(apiKeyEnv))
  } catch {
    throw new FileManageError('INVALID_CONFIG', `apiKeyEnv 配置不是合法的凭据引用：${apiKeyEnv}`, 500)
  }
  if (credential === undefined) {
    throw new FileManageError('MISSING_CREDENTIAL', `缺少凭据 ${apiKeyEnv}：请在 dsh 中配置 DeepSeek API key 后重试`, 401)
  }
  return { baseURL, apiKey: credential.value }
}
