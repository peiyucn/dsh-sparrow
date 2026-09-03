/**
 * CodeBuddy 模型目录解析：不预置任何模型信息。模型列表完全依赖用户给 Key
 * 的行为——保存 Key 时（或「获取可用模型」）才调 /v3/config 拉取，结果经
 * 设置节持久化。无 Key 时本插件不发任何网络请求。
 *
 * /v3/config 的模型条目带积分消耗系数（credits，如 "x0.79 credits"）与精确
 * 思考档位声明（reasoning.supportedEfforts / canDisableThinking）。系数附加进
 * 展示名（模型选择器可见），档位转成 reasoningEfforts 声明。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import {
  BASE_URL,
  CONFIG_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  OFFICIAL_USER_AGENT,
  PRODUCT_HEADER,
  PROVIDER,
} from './constants.js'

/** 设置节里一条模型配置（插件自有类型，不依赖 pi-ai）。 */
export interface CodeBuddyModelProfile {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: ('text' | 'image')[]
  reasoningEfforts?: false | Record<string, string | null>
}

/** 解析后的模型事实（adapter 与目录展示共用）。 */
export interface CodeBuddyModelFacts {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  input: readonly ('text' | 'image')[]
  reasoning: boolean
  thinkingLevelMap?: Record<string, string | null>
}

/** 完整解析的远端模型条目（比 DSH 的 LlmDiscoveredModel 多计费与档位事实）。 */
export interface CodeBuddyModelEntry {
  id: string
  name: string
  credits?: string
  contextWindow?: number
  maxTokens?: number
  input?: CodeBuddyModelProfile['input']
  reasoningEfforts?: CodeBuddyModelProfile['reasoningEfforts']
}

/** 一条模型配置 → 模型事实。未声明容量用兜底常量；推理三态（false/dict/缺省）。 */
export function codeBuddyModel(entry: CodeBuddyModelProfile): CodeBuddyModelFacts {
  const declared = entry.reasoningEfforts
  const reasoning = declared !== undefined && declared !== false
  const thinkingLevelMap = declared !== undefined && declared !== false
    ? { off: null, ...declared }
    : undefined
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    contextWindow: entry.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
    input: [...(entry.input ?? ['text'])],
    reasoning,
    ...(reasoning && thinkingLevelMap !== undefined ? { thinkingLevelMap } : {}),
  }
}

/** 配置 → 最终模型事实集。 */
export function resolveModels(configured: readonly CodeBuddyModelProfile[]): CodeBuddyModelFacts[] {
  return configured.map(entry => codeBuddyModel(entry))
}

/** 请求头：官方请求标识 + 企业上下文（值与官方 CLI 一致；uid/enterpriseId 来自 /v2/accounts）。 */
export function requestHeaders(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
): Record<string, string> {
  return {
    accept: 'application/json',
    'x-api-key': apiKey,
    'user-agent': OFFICIAL_USER_AGENT,
    'x-product': PRODUCT_HEADER,
    ...(account?.enterpriseId === undefined ? {} : {
      'x-enterprise-id': account.enterpriseId,
      'x-tenant-id': account.enterpriseId,
    }),
    ...(account?.userId === undefined ? {} : { 'x-user-id': account.userId }),
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

/** "x0.79 credits" / "x1.62" → 短系数 "x0.79" / "x1.62"。 */
function shortCredits(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const match = /x[\d.]+/i.exec(raw)
  return match?.[0]
}

/**
 * 官方思考档位集合里挑出服务端声明的支持档位；canDisableThinking=false 时
 * 不声明 off（模型不允许关思考，如 hy4-preview）。
 */
function declaredEfforts(raw: Record<string, unknown>): CodeBuddyModelProfile['reasoningEfforts'] {
  const supported = Array.isArray(raw.supportedEfforts) ? raw.supportedEfforts as unknown[] : undefined
  if (supported === undefined || supported.length === 0) return { off: null }
  const map: Record<string, string | null> = {}
  if (raw.canDisableThinking !== false) map.off = null
  for (const level of supported) {
    if (typeof level === 'string' && level.length > 0) map[level] = level
  }
  return map
}

/**
 * /v3/config 响应 → 完整模型条目（纯函数，供单测）。
 * 结构：data.agents 中 name === 'cli' 的 models 是允许的模型 id 列表；
 * data.models 是模型详情（id/name/credits/容量/多模态/思考档位）。
 */
export function parseModelConfig(body: unknown): readonly CodeBuddyModelEntry[] {
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
    const credits = shortCredits(raw.credits)
    const baseName = text(raw.name) ?? id
    const reasoning = raw.reasoning !== null && typeof raw.reasoning === 'object'
      ? raw.reasoning as Record<string, unknown>
      : undefined
    const entry: CodeBuddyModelEntry = {
      id,
      // 积分消耗系数附加进展示名：模型选择器一眼可见（免费模型显示 x0.00）
      name: credits === undefined ? baseName : baseName + ' · ' + credits,
      ...(credits === undefined ? {} : { credits }),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      input: raw.supportsImages === true ? ['text', 'image'] : ['text'],
      ...(reasoning !== undefined && raw.supportsReasoning === true
        ? { reasoningEfforts: declaredEfforts(reasoning) }
        : {}),
    }
    return [entry]
  })
}

/** 完整条目 → DSH 发现结果（官方「获取可用模型」契约的四字段，name 已带系数）。 */
export function toDiscovered(entries: readonly CodeBuddyModelEntry[]): LlmDiscoveredModel[] {
  return entries.map(entry => ({
    id: entry.id,
    ...(entry.name === entry.id ? {} : { name: entry.name }),
    ...(entry.contextWindow === undefined ? {} : { contextWindow: entry.contextWindow }),
    ...(entry.maxTokens === undefined ? {} : { maxTokens: entry.maxTokens }),
  }))
}

/** 完整条目 → 设置节模型条目（保留系数名与精确思考档位）。 */
export function discoveredToProfile(entries: readonly CodeBuddyModelEntry[]): CodeBuddyModelProfile[] {
  return entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    ...(entry.contextWindow === undefined ? {} : { contextWindow: entry.contextWindow }),
    ...(entry.maxTokens === undefined ? {} : { maxTokens: entry.maxTokens }),
    ...(entry.input === undefined ? {} : { input: entry.input }),
    ...(entry.reasoningEfforts === undefined ? {} : { reasoningEfforts: entry.reasoningEfforts }),
  }))
}

/** 拉取并解析 CodeBuddy 模型目录（只在用户给 Key 后调用）。 */
export async function fetchCodeBuddyModels(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
  signal?: AbortSignal,
): Promise<readonly CodeBuddyModelEntry[]> {
  let response: Response
  try {
    response = await fetch(CONFIG_URL, { headers: requestHeaders(apiKey, account), signal })
  } catch (error) {
    if (signal?.aborted) throw new LlmError('CodeBuddy 模型发现已取消', 'ABORTED', { cause: error })
    throw new LlmError('无法连接 CodeBuddy 模型配置接口', 'DISCOVERY_FAILED', { cause: error })
  }
  if (!response.ok) throw new LlmError('CodeBuddy 模型配置接口返回 ' + String(response.status), 'DISCOVERY_FAILED')
  const body = await response.json().catch(error => {
    throw new LlmError('CodeBuddy 模型配置接口返回了无法解析的数据', 'DISCOVERY_FAILED', { cause: error })
  })
  if ((body as { code?: number })?.code !== 0) {
    const detail = body as { msg?: unknown; code?: unknown }
    throw new LlmError('CodeBuddy 模型配置接口错误：' + String(detail.msg ?? detail.code ?? '未知'), 'DISCOVERY_FAILED')
  }
  const models = parseModelConfig(body)
  if (models.length === 0) throw new LlmError('CodeBuddy 没有返回 CLI 可用模型', 'DISCOVERY_FAILED')
  return models
}

/** DSH 模型发现契约入口（四字段）。 */
export async function discoverCodeBuddyModels(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
  signal?: AbortSignal,
): Promise<readonly LlmDiscoveredModel[]> {
  return toDiscovered(await fetchCodeBuddyModels(apiKey, account, signal))
}

export { BASE_URL, PROVIDER }
