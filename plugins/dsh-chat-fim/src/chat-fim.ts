/** dsh-chat-fim 纯逻辑：配置归一化、请求校验、错误映射、候选提取。 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/beta'
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024
export const DEFAULT_MAX_PROMPT_CHARS = 32_768
export const DEFAULT_MAX_TOKENS = 96
export const DEFAULT_SUGGESTION_COUNT = 1
/** 默认采样温度：0.3（2026-08-30 A/B：temp=1 漂移明显、会复读历史消息，0.3 聚焦稳定）。 */
export const DEFAULT_TEMPERATURE = 0.3
/** 上游响应正文读取上限：防止异常上游超大 body 撑爆内存。 */
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
  readonly suggestionCount: number
  readonly temperature: number
}

export interface CompleteRequest {
  readonly sessionId: string
  readonly prompt: string
  readonly locale?: string
  /** 续写模型三档（客户端偏好）；非法值回退 auto。 */
  readonly fimModelMode: FimModelMode
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

/**
 * 剥离补全开头泄漏的说话人标记（「助手：/用户：」、「Assistant: /User: 」）与前置换行/空白。
 * 上游 FIM 偶发不续写用户文本，而是复读历史转文本格式里的下一位说话人标记开头
 * （2026-08-30 实测：补全输出「助手：…」，续写变成助手口吻）。剥后为空串返回空串，
 * 由调用方丢弃该候选。标记出现在文本中间则不动（合法用户内容）。
 */
export function stripSpeakerPrefix(text: string, language: FimLanguage = 'zh'): string {
  const withoutLeading = text.replace(/^[\s\uFEFF]+/u, '')
  for (const role of ['assistant', 'user'] as const) {
    const marker = speakerText(language, role)
    if (!withoutLeading.startsWith(marker)) continue
    return withoutLeading.slice(marker.length).replace(/^[\s\uFEFF]+/u, '')
  }
  return withoutLeading
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
  return {
    sessionId,
    prompt,
    fimModelMode: normalizeFimModelMode(body.fimModelMode),
    ...locale === undefined ? {} : { locale },
  }
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

/** FIM 端点实测可用的模型 id（2026-08-30 直连实测；官方文档 schema 只列 v4-pro，flash 实际可用）。 */
export const FIM_MODEL_IDS = ['deepseek-v4-pro', 'deepseek-v4-flash'] as const

/** 续写模型三档选择（客户端偏好，随请求传给 host）。 */
export type FimModelMode = 'auto' | 'pro' | 'flash'
export const DEFAULT_FIM_MODEL_MODE: FimModelMode = 'auto'

/** 请求体里的 fimModelMode 解析：非法/缺省回退 auto。 */
export function normalizeFimModelMode(value: unknown): FimModelMode {
  return value === 'auto' || value === 'pro' || value === 'flash' ? value : DEFAULT_FIM_MODEL_MODE
}

/**
 * 补全模型解析（三档，见 docs/spec/04-model-choice.md）：
 * pro/flash 恒用对应模型；auto 跟随官方主模型（pro/flash），vision / 未知回退配置默认。
 */
export function resolveFimModel(mode: FimModelMode, main: { provider: string; model: string } | undefined, configuredModel: string): string {
  if (mode === 'pro') return 'deepseek-v4-pro'
  if (mode === 'flash') return 'deepseek-v4-flash'
  if (main !== undefined && main.provider === 'deepseek-official' && (FIM_MODEL_IDS as readonly string[]).includes(main.model)) {
    return main.model
  }
  return configuredModel
}

/** 从 FIM 上游响应提取 usage；缺失 / 非法字段回退 0（安全默认值）。 */
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

/** token 数展示格式化：千分位逗号（1234 → 1,234）。 */
export function formatTokenCount(count: number): string {
  const safe = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
}

/** 触发形态门控：草稿最短长度（trim 后）。标准档 CJK 草稿 8 字；纯拉丁草稿按词计，3 字符即可开补。 */
export const MIN_TRIGGER_DRAFT_CHARS = 8
export const MIN_TRIGGER_DRAFT_CHARS_LATIN = 3

/** 句末标点：草稿以这些字符结尾时句子已完整，FIM 会续出新一句而不是接话（实测质量差），不触发。 */
export const SENTENCE_END_CHARS = '。！？.!?;；'

/** CJK 字符检测：草稿含中日韩文字即按「中文语境」门控（2026-08-30 晚：不做 zh/en 硬切换，按内容自适应）。 */
const CJK_CHARS = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u

/** 触发灵敏度三档（2026-08-30 晚）：用户习惯不同，敏锐/钝化自己调。 */
export type FimSensitivity = 'eager' | 'standard' | 'conservative'
export const DEFAULT_FIM_SENSITIVITY: FimSensitivity = 'standard'

export interface FimSensitivityParams {
  /** 停顿阈值（毫秒）。 */
  readonly pauseMs: number
  /** 含 CJK 草稿的最短长度。 */
  readonly minCharsCjk: number
  /** 纯拉丁草稿的最短长度。 */
  readonly minCharsLatin: number
  /** 是否放行「夹在中文里的英文单词停一半」。 */
  readonly allowCjkMidWord: boolean
  /** 是否放行尾随空格（词后预测下一个词 / 空格分词续写）。 */
  readonly allowTrailingSpace: boolean
  /** 是否放行句末标点结尾（高档「什么都想续」；中低档续新一句质量差，抑制）。 */
  readonly allowSentenceEnd: boolean
}

export const FIM_SENSITIVITIES: Record<FimSensitivity, FimSensitivityParams> = {
  eager: {
    pauseMs: 250,
    minCharsCjk: 4,
    minCharsLatin: 2,
    allowCjkMidWord: true,
    allowTrailingSpace: true,
    allowSentenceEnd: true,
  },
  standard: {
    pauseMs: 400,
    minCharsCjk: MIN_TRIGGER_DRAFT_CHARS,
    minCharsLatin: MIN_TRIGGER_DRAFT_CHARS_LATIN,
    allowCjkMidWord: false,
    allowTrailingSpace: true,
    allowSentenceEnd: false,
  },
  conservative: {
    pauseMs: 800,
    minCharsCjk: 12,
    minCharsLatin: 5,
    allowCjkMidWord: false,
    allowTrailingSpace: false,
    allowSentenceEnd: false,
  },
}

/** 灵敏度解析：非法/缺省回退 standard。 */
export function normalizeFimSensitivity(value: unknown): FimSensitivity {
  return value === 'eager' || value === 'standard' || value === 'conservative' ? value : DEFAULT_FIM_SENSITIVITY
}

export type FimTriggerDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'empty' | 'too-short' | 'sentence-end' | 'mid-word' | 'trailing-space' }

/**
 * 依据草稿形态决定是否发起联想请求（2026-08-30 实测驱动，同日晚改为内容自适应 + 灵敏度可调）：
 * 句末标点 / 尾随空格 / 夹入英文半词 / 最短长度均按灵敏度参数伸缩，停顿阈值由客户端按同一参数取值。
 * 所有语言同一规则。
 */
export function shouldTriggerFim(draft: string, sensitivity: FimSensitivity = DEFAULT_FIM_SENSITIVITY): FimTriggerDecision {
  const params = FIM_SENSITIVITIES[sensitivity] ?? FIM_SENSITIVITIES[DEFAULT_FIM_SENSITIVITY]
  const trimmed = draft.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  const cjk = CJK_CHARS.test(trimmed)
  const minChars = cjk ? params.minCharsCjk : params.minCharsLatin
  if (trimmed.length < minChars) return { ok: false, reason: 'too-short' }
  const last = trimmed[trimmed.length - 1] ?? ''
  if (SENTENCE_END_CHARS.includes(last) && !params.allowSentenceEnd) {
    return { ok: false, reason: 'sentence-end' }
  }
  // 尾随空格（词后/句间）：按灵敏度放行/抑制。
  const rawLast = draft[draft.length - 1] ?? ''
  if (rawLast.trim() === '') {
    return params.allowTrailingSpace ? { ok: true } : { ok: false, reason: 'trailing-space' }
  }
  // 正停在一个字符上：CJK 草稿里夹入的英文单词续一半质量差，按灵敏度决定是否抑制。
  if (cjk && !params.allowCjkMidWord) {
    const prev = trimmed[trimmed.length - 2] ?? ''
    if (/[A-Za-z0-9]/u.test(last) && /[A-Za-z0-9]/u.test(prev)) return { ok: false, reason: 'mid-word' }
  }
  return { ok: true }
}

/** 超时错误是否应映射为 TIMEOUT。 */
export function isAbortTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
}
