/**
 * CodeBuddy 模型目录：内置兜底目录（按企业账号实测）+ 远程 /v3/config 发现。
 * 远程目录按 API key 的账号权限返回；内置目录保证插件在断网/接口变动时仍可用。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { PiAiModelProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { Api, Model, ModelCost } from '@earendil-works/pi-ai'
import {
  BASE_URL,
  CONFIG_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  OFFICIAL_USER_AGENT,
  PRODUCT_HEADER,
  PROVIDER,
} from './constants.js'

/** pi-ai 读不到的价格字段，全零即可（DSH 不计费展示）。 */
const NO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/**
 * CodeBuddy 的 OpenAI Chat Completions 方言开关：
 * - 不支持 store/developer role；
 * - 思考经 reasoning effort 表达；
 * - 输出上限字段用 max_tokens；
 * - 思考分发格式为 openai。
 */
const COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  maxTokensField: 'max_tokens',
  thinkingFormat: 'openai',
}

/**
 * 内置兜底目录（2026-09-02 按企业账号实测 /v3/config 快照）。
 * reasoningEfforts 声明 { off: null }：支持推理，off 档不发参数；其余档位
 * 的 wire 拼写与档位名一致，交给 pi-ai 的默认档位表。
 */
export const BUILTIN_MODELS: readonly PiAiModelProfile[] = [
  { id: 'hy4-preview', name: 'Hy4 preview', contextWindow: 1_000_000, maxTokens: 64_000, input: ['text', 'image'], reasoningEfforts: { off: null } },
  { id: 'hy3', name: 'Hy3', contextWindow: 192_000, maxTokens: 64_000, input: ['text', 'image'], reasoningEfforts: { off: null } },
  { id: 'hy3-x', name: 'Hy3', contextWindow: 192_000, maxTokens: 64_000, input: ['text', 'image'], reasoningEfforts: { off: null } },
  { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', contextWindow: 1_000_000, maxTokens: 32_000, input: ['text', 'image'], reasoningEfforts: { off: null } },
  { id: 'minimax-m3-pay', name: 'MiniMax-M3', contextWindow: 512_000, maxTokens: 128_000, input: ['text', 'image'], reasoningEfforts: { off: null } },
  { id: 'deepseek-v4-flash', name: 'Deepseek-V4-Flash', contextWindow: 1_000_000, maxTokens: 50_000, input: ['text', 'image'], reasoningEfforts: { off: null } },
]

/**
 * 一条模型配置 → pi-ai Model。未声明的字段继承内置同名模型（fallback），
 * 再退到兜底常量；推理能力三态：false 禁用、dict 显式声明（off 恒支持）、
 * 缺省继承 fallback 的推理能力。
 */
export function codeBuddyModel(entry: PiAiModelProfile, fallback?: Model<Api>): Model<Api> {
  const declared = entry.reasoningEfforts
  let reasoning: boolean
  let thinkingLevelMap: Model<Api>['thinkingLevelMap']
  if (declared === false) {
    reasoning = false
    thinkingLevelMap = undefined
  } else if (declared === undefined) {
    reasoning = fallback?.reasoning ?? false
    thinkingLevelMap = fallback?.thinkingLevelMap
  } else {
    reasoning = true
    thinkingLevelMap = { off: null, ...declared }
  }
  return {
    id: entry.id,
    name: entry.name ?? fallback?.name ?? entry.id,
    api: 'openai-completions',
    provider: PROVIDER,
    baseUrl: BASE_URL,
    reasoning,
    ...(reasoning && thinkingLevelMap !== undefined ? { thinkingLevelMap } : {}),
    input: [...(entry.input ?? fallback?.input ?? ['text'])],
    cost: { ...NO_COST },
    contextWindow: entry.contextWindow ?? fallback?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: entry.maxTokens ?? fallback?.maxTokens ?? DEFAULT_MAX_TOKENS,
    compat: { ...COMPAT },
  }
}

/**
 * 配置 → 最终模型集。settings 里的 models 为空时用内置目录；非空时逐条
 * 解析，每条继承内置同名模型未声明的字段。
 */
export function resolveModels(configured: readonly PiAiModelProfile[]): Model<Api>[] {
  const builtins = new Map(BUILTIN_MODELS.map(entry => [entry.id, codeBuddyModel(entry)]))
  if (configured.length === 0) return [...builtins.values()]
  return configured.map(entry => codeBuddyModel(entry, builtins.get(entry.id)))
}

/** 模型目录请求的三件套请求头。 */
export function configRequestHeaders(apiKey: string): Record<string, string> {
  return {
    accept: 'application/json',
    'x-api-key': apiKey,
    'user-agent': OFFICIAL_USER_AGENT,
    'x-product': PRODUCT_HEADER,
  }
}

function positiveInteger(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  }
  return undefined
}

function text(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/**
 * /v3/config 响应 → 发现结果（纯函数，供单测）。
 * 结构：data.agents 中 name === 'cli' 的 models 是允许的模型 id 列表；
 * data.models 是模型详情（id/name/maxInputTokens/maxOutputTokens）。
 */
export function parseModelConfig(body: unknown): readonly LlmDiscoveredModel[] {
  const data = (body as { data?: unknown })?.data as Record<string, unknown> | undefined
  const agents = Array.isArray(data?.agents) ? data.agents as Array<Record<string, unknown>> : (data?.agent as { agents?: unknown })?.agents as Array<Record<string, unknown>> | undefined
  const cli = Array.isArray(agents) ? agents.find(agent => agent?.name === 'cli') : undefined
  const allowed = Array.isArray(cli?.models) ? cli.models as unknown[] : []
  const byId = new Map((Array.isArray(data?.models) ? data.models as Array<Record<string, unknown>> : []).map(model => [model?.id, model]))
  return allowed.flatMap(id => {
    if (typeof id !== 'string') return []
    const raw = byId.get(id)
    if (raw === undefined) return []
    const contextWindow = positiveInteger(raw.maxInputTokens, raw.maxAllowedSize)
    const maxTokens = positiveInteger(raw.maxOutputTokens)
    if (contextWindow === undefined && maxTokens === undefined) return []
    const entry: LlmDiscoveredModel = {
      id,
      ...(text(raw.name) === undefined ? {} : { name: text(raw.name) }),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    }
    return [entry]
  })
}

/** 拉取 CodeBuddy 模型目录（settings 的「获取可用模型」）。 */
export async function discoverCodeBuddyModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<readonly LlmDiscoveredModel[]> {
  let response: Response
  try {
    response = await fetch(CONFIG_URL, { headers: configRequestHeaders(apiKey), signal })
  } catch (error) {
    if (signal?.aborted) throw new LlmError('CodeBuddy 模型发现已取消', 'ABORTED', { cause: error })
    throw new LlmError('无法连接 CodeBuddy 模型配置接口', 'DISCOVERY_FAILED', { cause: error })
  }
  if (!response.ok) throw new LlmError(`CodeBuddy 模型配置接口返回 ${response.status}`, 'DISCOVERY_FAILED')
  const body = await response.json().catch(error => {
    throw new LlmError('CodeBuddy 模型配置接口返回了无法解析的数据', 'DISCOVERY_FAILED', { cause: error })
  })
  if ((body as { code?: number })?.code !== 0) {
    const detail = body as { msg?: unknown; code?: unknown }
    throw new LlmError(`CodeBuddy 模型配置接口错误：${detail.msg ?? detail.code ?? '未知'}`, 'DISCOVERY_FAILED')
  }
  const models = parseModelConfig(body)
  if (models.length === 0) throw new LlmError('CodeBuddy 没有返回 CLI 可用模型', 'DISCOVERY_FAILED')
  return models
}
