/** dsh-chat-fim 纯逻辑：配置归一化、请求校验、错误映射、候选提取。 */

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/beta'
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024
export const DEFAULT_MAX_PROMPT_CHARS = 32_768
export const DEFAULT_MAX_TOKENS = 96
export const DEFAULT_TRIGGER_PAUSE_MS = 400
export const DEFAULT_SUGGESTION_COUNT = 2
export const DEFAULT_TEMPERATURE = 1
export const MAX_UPSTREAM_BODY_BYTES = 64 * 1024
export const MAX_HISTORY_MESSAGES = 12
export const MAX_HISTORY_CHARS = 6_000

export type ChatFimErrorCode =
  | 'BAD_BODY'
  | 'INVALID_PROMPT'
  | 'UNKNOWN_SESSION'
  | 'MISSING_CREDENTIAL'
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
}

export interface CompleteResponse {
  readonly suggestions: readonly string[]
}

/** FIM 补全的停止序列：历史转文本用「用户：/助手：」做说话人标记，命中即停，防止模型续写下一位说话人。 */
export const FIM_STOP_SEQUENCES: readonly string[] = ['\n用户：', '\n助手：']

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
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return { code: 'BAD_BODY', message: 'sessionId 必须是非空字符串' }
  }
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return { code: 'INVALID_PROMPT', message: 'prompt 必须是非空字符串' }
  }
  if (prompt.length > maxPromptChars) {
    return { code: 'INVALID_PROMPT', message: `prompt 超过 ${maxPromptChars} 字符上限` }
  }
  return { sessionId, prompt }
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
 * 构造 FIM 补全 prompt：最近对话历史转成「用户：/助手：」说话人文本，草稿作为
 * 最后一个「用户：」开头。FIM 直接续写文本本身，没有角色语义，补全天然站在用户
 * 角度；stop 序列防止模型接着写下一位说话人。
 */
export function buildFimPrompt(
  history: readonly unknown[],
  draft: string,
  maxMessages = MAX_HISTORY_MESSAGES,
  maxChars = MAX_HISTORY_CHARS,
): string {
  const recent: Array<{ speaker: '用户' | '助手'; text: string }> = []
  let chars = 0
  for (const message of [...history].reverse()) {
    if (recent.length >= maxMessages) break
    const text = textFromHistoryMessage(message)
    if (text === '') continue
    if (chars + text.length > maxChars && recent.length > 0) break
    recent.unshift({ speaker: messageRole(message) === 'assistant' ? '助手' : '用户', text })
    chars += text.length
  }

  const transcript = recent.map(entry => `${entry.speaker}：${entry.text}`).join('\n')
  return `${transcript === '' ? '' : `${transcript}\n\n`}用户：${draft}`
}

function messageRole(message: unknown): 'user' | 'assistant' {
  const role = (message as { role?: unknown }).role
  return role === 'assistant' ? 'assistant' : 'user'
}

/** 把上游 HTTP 状态映射为插件错误码。 */
export function upstreamStatusToError(status: number, bodyText: string): ChatFimError {
  if (status === 401 || status === 403) {
    return { code: 'MISSING_CREDENTIAL', message: 'DeepSeek API 凭据无效或无权访问对话前缀续写 Beta' }
  }
  if (status === 408 || status === 504) {
    return { code: 'TIMEOUT', message: 'DeepSeek 对话前缀续写上游超时' }
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'DeepSeek 对话前缀续写上游限流，请稍后重试' }
  }
  const detail = summarizeUpstreamBody(bodyText)
  return {
    code: 'UPSTREAM_ERROR',
    message: detail === '' ? `DeepSeek 对话前缀续写上游返回 HTTP ${status}` : `DeepSeek 对话前缀续写上游错误：${detail}`,
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

/** 超时错误是否应映射为 TIMEOUT。 */
export function isAbortTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
}
