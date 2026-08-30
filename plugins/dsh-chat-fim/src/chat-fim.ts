/** dsh-chat-fim 纯逻辑：配置归一化、请求校验、错误映射、候选提取。 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/beta'
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024
export const DEFAULT_MAX_PROMPT_CHARS = 32_768
export const DEFAULT_MAX_TOKENS = 96
export const DEFAULT_TRIGGER_PAUSE_MS = 400
export const DEFAULT_SUGGESTION_COUNT = 1
export const DEFAULT_TEMPERATURE = 1
export const MAX_UPSTREAM_BODY_BYTES = 64 * 1024
export const MAX_HISTORY_MESSAGES = 12
export const MAX_HISTORY_CHARS = 6_000

export type ChatFimErrorCode =
  | 'BAD_BODY'
  | 'INVALID_PROMPT'
  | 'UNKNOWN_SESSION'
  | 'MISSING_CREDENTIAL'
  | 'MODEL_UNSUPPORTED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_CONFIG'

export interface ChatFimError {
  readonly code: ChatFimErrorCode
  readonly message: string
}

export interface ChatFimConfig {
  readonly baseURL: string
  readonly model: string
  readonly maxTokens: number
  readonly apiKeyEnv: string
  readonly requestTimeoutMs: number
  readonly maxBodyBytes: number
  readonly maxPromptChars: number
  readonly triggerPauseMs: number
  readonly suggestionCount: number
  readonly temperature: number
}

export interface CompleteRequest {
  readonly sessionId: string
  readonly prompt: string
  readonly locale?: string
}

export interface CompleteResponse {
  readonly suggestions: readonly string[]
}

/** FIM 提示词使用的语言（说话人标签 / 停止序列随之切换）。 */
export type FimLanguage = 'zh' | 'en'

const SPEAKER_LABELS: Record<FimLanguage, { user: string; assistant: string }> = {
  zh: { user: '用户', assistant: '助手' },
  en: { user: 'User', assistant: 'Assistant' },
}

/** 说话人文本格式：zh 用全角冒号，en 用半角冒号 + 空格。 */
function speakerText(language: FimLanguage, role: 'user' | 'assistant'): string {
  const label = role === 'assistant' ? SPEAKER_LABELS[language].assistant : SPEAKER_LABELS[language].user
  return language === 'zh' ? `${label}：` : `${label}: `
}

/** FIM 停止序列：历史转文本用说话人标记，命中即停，防止模型续写下一位说话人。 */
export function fimStopSequences(language: FimLanguage): readonly string[] {
  return ['user', 'assistant'].map(role => `\n${speakerText(language, role as 'user' | 'assistant')}`)
}

/** 主模型路由：会话事件里最近一条 request/header 的 provider/model。 */
export function mainRouteFromSession(events: readonly SessionEvent[]): { provider: string; model: string } | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== 'request/header') continue
    const config = (event.data as { header?: { config?: { provider?: unknown; model?: unknown } } }).header?.config
    if (typeof config?.provider === 'string' && typeof config.model === 'string') {
      return { provider: config.provider, model: config.model }
    }
  }
  return undefined
}

/** 主模型是否为 DeepSeek 系列（deepseek-official provider）；未知路由默认放行。 */
export function isDeepseekMainRoute(route: { provider: string } | undefined): boolean {
  return route === undefined || route.provider === 'deepseek-official'
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
    triggerPauseMs: input?.triggerPauseMs ?? DEFAULT_TRIGGER_PAUSE_MS,
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
    triggerPauseMs: config.triggerPauseMs,
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

/** 安全解析请求体；超限 / 非法 JSON 返回 BAD_BODY。 */
export function parseCompleteBody(body: string, maxBodyBytes: number, maxPromptChars = Number.MAX_SAFE_INTEGER): CompleteRequest | ChatFimError {
  if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
    return { code: 'BAD_BODY', message: `请求体超过 ${maxBodyBytes} 字节上限` }
  }
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return { code: 'BAD_BODY', message: '请求体不是合法 JSON' }
  }
  return validateCompletePayload(value, maxPromptChars)
}

/** 校验已解析请求。prompt 按字符数限制（上限为 MAX_SAFE_INTEGER 时表示不限制）。 */
export function validateCompletePayload(value: unknown, maxPromptChars = Number.MAX_SAFE_INTEGER): CompleteRequest | ChatFimError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { code: 'BAD_BODY', message: '请求体必须是 JSON 对象' }
  }
  const body = value as Record<string, unknown>
  const sessionId = body.sessionId
  const prompt = body.prompt
  const locale = body.locale
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return { code: 'BAD_BODY', message: 'sessionId 必须是非空字符串' }
  }
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return { code: 'INVALID_PROMPT', message: 'prompt 必须是非空字符串' }
  }
  if (prompt.length > maxPromptChars) {
    return { code: 'INVALID_PROMPT', message: `prompt 超过 ${maxPromptChars} 字符上限` }
  }
  if (locale !== undefined && typeof locale !== 'string') {
    return { code: 'BAD_BODY', message: 'locale 必须是字符串' }
  }
  return { sessionId, prompt, ...locale === undefined ? {} : { locale } }
}

/** 从一条 DSH 历史消息里提取可读文本；图片 / 工具结果等非续写块跳过。 */
function textFromHistoryMessage(message: unknown): string {
  if (typeof message !== 'object' || message === null) return ''
  const candidate = message as { role?: unknown; content?: unknown }
  if (candidate.role !== 'user' && candidate.role !== 'assistant') return ''
  if (!Array.isArray(candidate.content)) return ''
  const parts: string[] = []
  for (const block of candidate.content) {
    if (typeof block !== 'object' || block === null) continue
    const text = (block as { type?: unknown; text?: unknown }).text
    if ((block as { type?: unknown }).type === 'text' && typeof text === 'string' && text.trim() !== '') {
      parts.push(text.trim())
    }
  }
  return parts.join('\n').trim()
}

/**
 * 构造 FIM 补全 prompt：最近对话历史转成说话人文本（zh「用户：/助手：」、en「User:/Assistant:」），
 * 草稿作为最后一个用户说话人的开头。FIM 直接续写文本本身，没有角色语义，补全天然站在
 * 用户角度；stop 序列（见 fimStopSequences）防止模型接着写下一位说话人。
 */
export function buildFimPrompt(
  history: readonly unknown[],
  draft: string,
  language: FimLanguage = 'zh',
  maxMessages = MAX_HISTORY_MESSAGES,
  maxChars = MAX_HISTORY_CHARS,
): string {
  const recent: Array<{ role: 'user' | 'assistant'; text: string }> = []
  let chars = 0
  for (const message of [...history].reverse()) {
    if (recent.length >= maxMessages) break
    const text = textFromHistoryMessage(message)
    if (text === '') continue
    if (chars + text.length > maxChars && recent.length > 0) break
    recent.unshift({ role: messageRole(message), text })
    chars += text.length
  }

  const transcript = recent.map(entry => `${speakerText(language, entry.role)}${entry.text}`).join('\n')
  return `${transcript === '' ? '' : `${transcript}\n\n`}${speakerText(language, 'user')}${draft}`
}

function messageRole(message: unknown): 'user' | 'assistant' {
  const role = (message as { role?: unknown }).role
  return role === 'assistant' ? 'assistant' : 'user'
}

/** 把上游 HTTP 状态映射为插件错误码。 */
export function upstreamStatusToError(status: number, bodyText: string): ChatFimError {
  if (status === 401 || status === 403) {
    return { code: 'MISSING_CREDENTIAL', message: 'DeepSeek API 凭据无效或无权访问 FIM 补全 Beta' }
  }
  if (status === 408 || status === 504) {
    return { code: 'TIMEOUT', message: 'DeepSeek FIM 补全上游超时' }
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'DeepSeek FIM 补全上游限流，请稍后重试' }
  }
  const detail = summarizeUpstreamBody(bodyText)
  return {
    code: 'UPSTREAM_ERROR',
    message: detail === '' ? `DeepSeek FIM 补全上游返回 HTTP ${status}` : `DeepSeek FIM 补全上游错误：${detail}`,
  }
}

/** 只截取上游错误正文的短前缀，避免把上游大段内容带回客户端。 */
export function summarizeUpstreamBody(body: string, maxChars = 200): string {
  const compact = body.replace(/\s+/gu, ' ').trim()
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars)}…`
}

/** 从上游 choices 中提取非空候选文本（兼容 chat.completions 的 message.content 与旧 text 字段）。 */
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

/** 对话前缀续写建议作废判定：草稿修订号变了就是陈旧响应。 */
export function isStaleResponse(requestDraftRev: number, currentDraftRev: number): boolean {
  return requestDraftRev !== currentDraftRev
}

/** 触发形态门控：草稿最短长度（trim 后）。 */
export const MIN_TRIGGER_DRAFT_CHARS = 8

/** 句末标点：草稿以这些字符结尾时句子已完整，FIM 会续出新一句而不是接话（实测质量差），不触发。 */
export const SENTENCE_END_CHARS = '。！？.!?;；'

export type FimTriggerDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'empty' | 'too-short' | 'sentence-end' | 'mid-word' | 'trailing-space' }

/**
 * 依据草稿形态决定是否发起联想请求（2026-08-30 实测驱动）：
 * 句末标点 / 尾随空白 / 单词中间都不触发，避免建议太频繁且续出「新一句话」。
 */
export function shouldTriggerFim(draft: string): FimTriggerDecision {
  const trimmed = draft.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  if (trimmed.length < MIN_TRIGGER_DRAFT_CHARS) return { ok: false, reason: 'too-short' }
  // 尾随空白必须查原文末尾（trim 后看不到）：用户刚敲完空格/换行，正在输入。
  const rawLast = draft[draft.length - 1] ?? ''
  if (rawLast.trim() === '') return { ok: false, reason: 'trailing-space' }
  const last = trimmed[trimmed.length - 1] ?? ''
  if (SENTENCE_END_CHARS.includes(last)) return { ok: false, reason: 'sentence-end' }
  const prev = trimmed[trimmed.length - 2] ?? ''
  if (/[A-Za-z0-9]/u.test(last) && /[A-Za-z0-9]/u.test(prev)) return { ok: false, reason: 'mid-word' }
  return { ok: true }
}

/** 超时错误是否应映射为 TIMEOUT。 */
export function isAbortTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
}
