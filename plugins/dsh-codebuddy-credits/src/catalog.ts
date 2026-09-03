/**
 * CodeBuddy 模型目录解析：不预置任何模型信息。模型列表完全依赖用户给 Key
 * 的行为——保存 Key 时（或「获取可用模型」）才调 /v3/config 拉取，结果经
 * 设置节持久化。无 Key 时本插件不发任何网络请求。
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
 * 一条模型配置 → pi-ai Model。未声明容量时用兜底常量；
 * 推理能力：false 禁用、dict 显式声明（off 恒支持）、缺省不声明
 * （不发思考参数，交给服务端默认档位）。
 */
export function codeBuddyModel(entry: PiAiModelProfile): Model<Api> {
  const declared = entry.reasoningEfforts
  const reasoning = declared !== undefined && declared !== false
  const thinkingLevelMap = declared !== undefined && declared !== false
    ? { off: null, ...declared }
    : undefined
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    api: 'openai-completions',
    provider: PROVIDER,
    baseUrl: BASE_URL,
    reasoning,
    ...(reasoning && thinkingLevelMap !== undefined ? { thinkingLevelMap } : {}),
    input: [...(entry.input ?? ['text'])],
    cost: { ...NO_COST },
    contextWindow: entry.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
    compat: { ...COMPAT },
  }
}

/** 配置 → 最终模型集。 */
export function resolveModels(configured: readonly PiAiModelProfile[]): Model<Api>[] {
  return configured.map(entry => codeBuddyModel(entry))
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

/**
 * 发现结果 → 设置节模型条目。CodeBuddy 的 CLI 模型均支持思考档位，
 * 声明 { off: null }（支持推理、off 不发参数，其余档位按 pi-ai 默认表）。
 */
export function discoveredToProfile(models: readonly LlmDiscoveredModel[]): PiAiModelProfile[] {
  return models.map(model => ({
    id: model.id,
    ...(model.name === undefined ? {} : { name: model.name }),
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
    reasoningEfforts: { off: null },
  }))
}

/** 拉取 CodeBuddy 模型目录（只在用户给 Key 后调用）。 */
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
