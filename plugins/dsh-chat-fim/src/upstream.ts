

import type { EpochHeader } from '@deepseek-ai/dsh-session'


export const MAX_UPSTREAM_BODY_BYTES = 64 * 1024

export type ChatFimErrorCode =
  | 'BAD_BODY'
  | 'INVALID_PROMPT'
  | 'UNKNOWN_SESSION'
  | 'MISSING_CREDENTIAL'
  | 'MODEL_UNSUPPORTED'
  | 'UNSUPPORTED_HOST'
  | 'UNSUPPORTED_HOST_FORMAT'
  | 'FORBIDDEN'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_CONFIG'

export interface ChatFimError {
  readonly code: ChatFimErrorCode
  readonly message: string
}


export function isChatFimError(value: unknown): value is ChatFimError {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}


export function upstreamStatusToError(status: number, bodyText: string): ChatFimError {
  if (status === 401 || status === 403) {
    return { code: 'MISSING_CREDENTIAL', message: 'DeepSeek API 凭据无效或无权访问续写接口（Beta）' }
  }
  if (status === 408 || status === 504) {
    return { code: 'TIMEOUT', message: 'DeepSeek 续写上游超时' }
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'DeepSeek 续写上游限流，请稍后重试' }
  }
  const detail = summarizeUpstreamBody(bodyText)
  return {
    code: 'UPSTREAM_ERROR',
    message: detail === '' ? `DeepSeek 续写上游返回 HTTP ${status}` : `DeepSeek 续写上游错误：${detail}`,
  }
}


export function summarizeUpstreamBody(body: string, maxChars = 200): string {
  const compact = body.replace(/\s+/gu, ' ').trim()
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars)}…`
}


export function extractSuggestions(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return []
  const suggestions: string[] = []
  for (const choice of choices) {
    if (typeof choice !== 'object' || choice === null) continue
    const candidate = choice as { text?: unknown; message?: { content?: unknown } }
    const text = typeof candidate.message?.content === 'string'
      ? candidate.message.content
      : candidate.text
    if (typeof text === 'string' && text.trim() !== '' && !suggestions.includes(text)) {
      suggestions.push(text.trim())
    }
  }
  return suggestions
}


export const SUGGEST_MODEL_IDS = ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-v4-flash'] as const


export function mainRouteFromHeader(header: EpochHeader | undefined): { provider: string; model: string } | undefined {
  const config = header?.config
  if (typeof config?.provider === 'string' && typeof config.model === 'string') {
    return { provider: config.provider, model: config.model }
  }
  return undefined
}


export function isDeepseekMainRoute(route: { provider: string } | undefined): boolean {
  return route === undefined || route.provider === 'deepseek-official'
}


export function currentMainRoute(
  selection: { pending?: { provider: string; model: string } | null; lastUsed?: { provider: string; model: string } | null } | undefined,
  headerRoute: { provider: string; model: string } | undefined,
  defaultModel: { provider: string; model: string } | undefined,
): { provider: string; model: string } | undefined {
  return selection?.pending ?? selection?.lastUsed ?? headerRoute ?? defaultModel
}


export function resolveSuggestModel(main: { provider: string; model: string } | undefined, configuredModel: string): string {
  if (main !== undefined && main.provider === 'deepseek-official' && (SUGGEST_MODEL_IDS as readonly string[]).includes(main.model)) {
    return main.model
  }
  return configuredModel
}


export function extractUsage(data: unknown): { promptTokens: number; completionTokens: number } {
  const usage = typeof data === 'object' && data !== null
    ? (data as { usage?: unknown }).usage
    : undefined
  const record = typeof usage === 'object' && usage !== null
    ? usage as Record<string, unknown>
    : undefined
  const num = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  return {
    promptTokens: num(record?.prompt_tokens),
    completionTokens: num(record?.completion_tokens),
  }
}


export function isAbortTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
}
