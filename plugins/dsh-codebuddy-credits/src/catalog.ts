

import { randomUUID } from 'node:crypto'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import {
  CLIENT_NAME,
  CONFIG_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  MODEL_DISCOVERY_TIMEOUT_MS,
  PRODUCT_HEADER,
  REQUEST_USER_AGENT,
} from './constants.js'


export type ReasoningEfforts = false | Record<string, string | null>


export interface CodeBuddyModelEntry {
  id: string

  name: string

  credits?: string
  contextWindow?: number
  maxTokens?: number
  input?: ('text' | 'image')[]
  reasoningEfforts?: ReasoningEfforts

  defaultEffort?: string

  description?: string
}


export interface CodeBuddyModelFacts {
  id: string

  name: string

  credits?: string
  contextWindow: number
  maxTokens: number
  input: readonly ('text' | 'image')[]
  reasoning: boolean
  thinkingLevelMap?: Record<string, string | null>
  defaultEffort?: string
  description?: string
}


const EFFORT_RANK: Readonly<Record<string, number>> = {
  off: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
}


const UNKNOWN_EFFORT_RANK = Number.MAX_SAFE_INTEGER


function sortEfforts(levels: readonly string[]): string[] {
  return levels
    .map((level, index) => ({ level, index }))
    .sort((a, b) =>
      (EFFORT_RANK[a.level] ?? UNKNOWN_EFFORT_RANK) - (EFFORT_RANK[b.level] ?? UNKNOWN_EFFORT_RANK)
      || a.index - b.index)
    .map(entry => entry.level)
}


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


export function factsFromEntries(entries: readonly CodeBuddyModelEntry[]): CodeBuddyModelFacts[] {
  return entries.map(entry => {
    const declared = entry.reasoningEfforts
    const reasoning = declared !== undefined && declared !== false

    const thinkingLevelMap = declared !== undefined && declared !== false
      ? { ...declared }
      : undefined
    return {
      id: entry.id,
      name: entry.name,
      ...(entry.credits === undefined ? {} : { credits: entry.credits }),
      contextWindow: entry.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      maxTokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
      input: [...(entry.input ?? ['text'])],
      reasoning,
      ...(reasoning && thinkingLevelMap !== undefined ? { thinkingLevelMap } : {}),
      ...(reasoning && entry.defaultEffort !== undefined ? { defaultEffort: entry.defaultEffort } : {}),
      ...(entry.description === undefined ? {} : { description: entry.description }),
    }
  })
}


export function requestHeaders(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
): Record<string, string> {
  return {
    accept: 'application/json',
    'x-api-key': apiKey,
    'user-agent': REQUEST_USER_AGENT,
    'x-product': PRODUCT_HEADER,

    'x-ide-name': CLIENT_NAME,
    ...(account?.enterpriseId === undefined ? {} : {
      'x-enterprise-id': account.enterpriseId,
      'x-tenant-id': account.enterpriseId,
    }),
    ...(account?.userId === undefined ? {} : { 'x-user-id': account.userId }),
  }
}


export function conversationHeaders(): Record<string, string> {
  return {
    'x-conversation-id': randomUUID(),
    'x-conversation-request-id': randomUUID(),
    'x-conversation-message-id': randomUUID(),
  }
}


export function chatHeaders(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
): Record<string, string> {
  return { ...requestHeaders(apiKey, account), ...conversationHeaders() }
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


function shortCredits(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const match = /x[\d.]+/i.exec(raw)
  return match?.[0]
}


function declaredEfforts(raw: Record<string, unknown>): ReasoningEfforts {
  const supported = Array.isArray(raw.supportedEfforts) ? raw.supportedEfforts as unknown[] : undefined
  if (supported !== undefined && supported.length > 0) {
    const levels = supported.filter((level): level is string => typeof level === 'string' && level.length > 0)


    const map: Record<string, string | null> = {}
    if (raw.canDisableThinking !== false) map.off = null
    for (const level of sortEfforts(levels)) {
      map[level] = level
    }
    return map
  }
  if (typeof raw.effort === 'string' && raw.effort.length > 0) {
    return { [raw.effort]: raw.effort }
  }
  return { off: null }
}


function declaredDefaultEffort(raw: Record<string, unknown>): string | undefined {
  const declared = raw.defaultEffort
  if (typeof declared === 'string' && declared.length > 0) return declared
  const fixed = raw.effort
  return typeof fixed === 'string' && fixed.length > 0 ? fixed : undefined
}


function supportsNativeVision(raw: Record<string, unknown>): boolean {
  return raw.supportsImages === true
}


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
    const description = text(raw.descriptionZh) ?? text(raw.descriptionEn)
    const reasoning = raw.reasoning !== null && typeof raw.reasoning === 'object'
      ? raw.reasoning as Record<string, unknown>
      : undefined
    const entry: CodeBuddyModelEntry = {
      id,
      name: baseName,
      ...(description === undefined ? {} : { description }),
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


export function toDiscovered(entries: readonly CodeBuddyModelEntry[]): LlmDiscoveredModel[] {
  return entries.map(entry => ({
    id: entry.id,
    ...(entry.name === entry.id ? {} : { name: entry.name }),
    ...(entry.contextWindow === undefined ? {} : { contextWindow: entry.contextWindow }),
    ...(entry.maxTokens === undefined ? {} : { maxTokens: entry.maxTokens }),
  }))
}


export async function fetchCodeBuddyModels(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
  signal?: AbortSignal,
): Promise<readonly CodeBuddyModelEntry[]> {
  signal?.throwIfAborted()
  const timeout = AbortSignal.timeout(MODEL_DISCOVERY_TIMEOUT_MS)
  const upstream = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
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


export async function discoverCodeBuddyModels(
  apiKey: string,
  account?: { userId?: string; enterpriseId?: string },
  signal?: AbortSignal,
): Promise<readonly LlmDiscoveredModel[]> {
  return toDiscovered(await fetchCodeBuddyModels(apiKey, account, signal))
}
