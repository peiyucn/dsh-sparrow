/**
 * CodeBuddy 模型目录解析：不预置任何模型信息。模型列表完全依赖用户给 Key
 * 的行为——保存 Key 后（及宿主重建模型目录时）才调 /v3/config 拉取，模型
 * 事实只存进程内、不落设置节（设置页不自建模型列表，模型列表随 Key 走）。
 * 无 Key 时本插件不发任何网络请求。
 *
 * /v3/config 的模型条目带积分消耗系数（credits，如 "x0.79 credits"）、多模态
 * 声明（supportsImages）与精确思考档位声明（reasoning.supportedEfforts /
 * canDisableThinking）。系数与视觉标记附加进展示名（模型选择器只渲染
 * model.name，官方 UI 没有独立字段位），档位转成 reasoningEfforts 声明。
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import {
  BASE_URL,
  CONFIG_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  MODEL_DISCOVERY_TIMEOUT_MS,
  OFFICIAL_USER_AGENT,
  PRODUCT_HEADER,
  PROVIDER,
} from './constants.js'

/** 思考档位声明：false 禁用；dict 显式声明（key 为档位 id，value 为 wire 拼写，null 表示不发参数）。 */
export type ReasoningEfforts = false | Record<string, string | null>

/** 完整解析的远端模型条目（比 DSH 的 LlmDiscoveredModel 多计费、多模态与档位事实）。 */
export interface CodeBuddyModelEntry {
  id: string
  /** 服务端原始模型名（不含任何插件附加标记）。 */
  name: string
  /** 积分消耗系数短串（"x0.79"），缺省表示服务端未声明。 */
  credits?: string
  contextWindow?: number
  maxTokens?: number
  input?: ('text' | 'image')[]
  reasoningEfforts?: ReasoningEfforts
  /** 服务端声明的默认思考档位（fixed-effort 形态取 effort 值本身）。 */
  defaultEffort?: string
}

/** 解析后的模型事实（adapter 与状态接口共用）。 */
export interface CodeBuddyModelFacts {
  id: string
  /** 展示名：原始名 + 系数（模型选择器可见的唯一文本位）。 */
  name: string
  contextWindow: number
  maxTokens: number
  input: readonly ('text' | 'image')[]
  reasoning: boolean
  thinkingLevelMap?: Record<string, string | null>
  defaultEffort?: string
}

/** "x0.79 credits" → 短系数 "x0.79"；数值为 0（如 "x0.00"）→ "free"；非字符串 → undefined。 */
export function creditLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const match = /x([\d.]+)/i.exec(raw)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) && value === 0 ? 'free' : 'x' + match[1]
}

/**
 * 展示名组装：原始名 + 两空格 + 积分系数（free/x0.79）。
 * 视觉能力不进名字（列表里不挂 👁 标记）——能力走 inputModalities 声明，
 * 视觉提示只在聊天头部额度卡展示；两空格是自建选择器拆分左右列的锚点。
 */
export function displayName(entry: {
  name: string
  credits?: string
  input?: readonly ('text' | 'image')[]
}): string {
  const credits = creditLabel(entry.credits)
  return credits === undefined ? entry.name : entry.name + '  ' + credits
}

/** 思考档位 id → 展示名（选择器推理等级面板用；未知 id 原样）。 */
export function effortName(id: string): string {
  switch (id) {
    case 'off': return 'Off'
    case 'minimal': return 'Minimal'
    case 'low': return 'Low'
    case 'medium': return 'Medium'
    case 'high': return 'High'
    case 'xhigh': return 'Extra high'
    case 'max': return 'Max'
    default: return id
  }
}

/** 完整条目 → 模型事实（推理三态：false/dict/缺省；未声明容量用兜底常量）。 */
export function factsFromEntries(entries: readonly CodeBuddyModelEntry[]): CodeBuddyModelFacts[] {
  return entries.map(entry => {
    const declared = entry.reasoningEfforts
    const reasoning = declared !== undefined && declared !== false
    // off 是否可用由 declaredEfforts 依据 canDisableThinking 决定，
    // 这里只透传（不再无条件塞 off——hy4-preview 不可关思考、固定档位模型只有一档）。
    const thinkingLevelMap = declared !== undefined && declared !== false
      ? { ...declared }
      : undefined
    return {
      id: entry.id,
      name: displayName(entry),
      contextWindow: entry.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      maxTokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
      input: [...(entry.input ?? ['text'])],
      reasoning,
      ...(reasoning && thinkingLevelMap !== undefined ? { thinkingLevelMap } : {}),
      ...(reasoning && entry.defaultEffort !== undefined ? { defaultEffort: entry.defaultEffort } : {}),
    }
  })
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
 * 实测 reasoning 有两种形态：
 * - 可选档位：supportedEfforts 数组 + canDisableThinking + defaultEffort
 *   （如 glm-5.3-flash / hy4-preview）；
 * - 固定档位：只有 effort 单字符串（如 deepseek-v4-pro=high、
 *   minimax-m3-pay=medium）——只有这一档、不可关。
 */
function declaredEfforts(raw: Record<string, unknown>): ReasoningEfforts {
  const supported = Array.isArray(raw.supportedEfforts) ? raw.supportedEfforts as unknown[] : undefined
  if (supported !== undefined && supported.length > 0) {
    const map: Record<string, string | null> = {}
    if (raw.canDisableThinking !== false) map.off = null
    for (const level of supported) {
      if (typeof level === 'string' && level.length > 0) map[level] = level
    }
    return map
  }
  if (typeof raw.effort === 'string' && raw.effort.length > 0) {
    return { [raw.effort]: raw.effort }
  }
  return { off: null }
}

/** 服务端声明的默认档位（可选档位形态取 defaultEffort，固定档位形态取 effort）。 */
function declaredDefaultEffort(raw: Record<string, unknown>): string | undefined {
  const declared = raw.defaultEffort
  if (typeof declared === 'string' && declared.length > 0) return declared
  const fixed = raw.effort
  return typeof fixed === 'string' && fixed.length > 0 ? fixed : undefined
}

/** 实测的视觉判定（2026-09）：supportsImages 对 deepseek-v4-pro/flash 也返回
 * true，但它们是纯文本模型（官方 DSH 目录里视觉是单独的 flash-vision-exp
 * 变体）。可信信号 = supportsImages 且（服务端显式 enabledMultimodal
 * （disabledMultimodal === false）或 描述/名字声明多模态）。 */
const MULTIMODAL_HINT = /多模态|multimodal|vision/i

function supportsNativeVision(raw: Record<string, unknown>): boolean {
  if (raw.supportsImages !== true) return false
  if (raw.disabledMultimodal === false) return true
  const hints = [raw.descriptionZh, raw.descriptionEn, raw.name]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return MULTIMODAL_HINT.test(hints)
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
      name: baseName,
      ...(credits === undefined ? {} : { credits }),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      input: supportsNativeVision(raw) ? ['text', 'image'] : ['text'],
      ...(reasoning !== undefined && raw.supportsReasoning === true
        ? {
          reasoningEfforts: declaredEfforts(reasoning),
          ...(declaredDefaultEffort(reasoning) === undefined
            ? {}
            : { defaultEffort: declaredDefaultEffort(reasoning) }),
        }
        : {}),
    }
    return [entry]
  })
}

/** 完整条目 → DSH 发现结果（官方「获取可用模型」契约的四字段，name 带系数/视觉标记）。 */
export function toDiscovered(entries: readonly CodeBuddyModelEntry[]): LlmDiscoveredModel[] {
  return entries.map(entry => {
    const name = displayName(entry)
    return {
      id: entry.id,
      ...(name === entry.id ? {} : { name }),
      ...(entry.contextWindow === undefined ? {} : { contextWindow: entry.contextWindow }),
      ...(entry.maxTokens === undefined ? {} : { maxTokens: entry.maxTokens }),
    }
  })
}

/** 拉取并解析 CodeBuddy 模型目录（只在用户给 Key 后调用），带超时。 */
export async function fetchCodeBuddyModels(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
  signal?: AbortSignal,
): Promise<readonly CodeBuddyModelEntry[]> {
  const timeout = AbortSignal.timeout(MODEL_DISCOVERY_TIMEOUT_MS)
  const upstream = signal === undefined || signal.aborted ? timeout : AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(CONFIG_URL, { headers: requestHeaders(apiKey, account), signal: upstream })
  } catch (error) {
    if (signal?.aborted) throw new LlmError('CodeBuddy 模型发现已取消', 'ABORTED', { cause: error })
    if (timeout.aborted) throw new LlmError('CodeBuddy 模型配置接口超时', 'DISCOVERY_FAILED', { cause: error })
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
