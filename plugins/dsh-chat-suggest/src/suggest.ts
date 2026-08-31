/** dsh-chat-suggest 纯逻辑：配置归一化、请求校验、错误映射、候选提取。 */

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

export type ChatSuggestErrorCode =
  | 'BAD_BODY'
  | 'INVALID_PROMPT'
  | 'UNKNOWN_SESSION'
  | 'MISSING_CREDENTIAL'
  | 'MODEL_UNSUPPORTED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_CONFIG'

export interface ChatSuggestError {
  readonly code: ChatSuggestErrorCode
  readonly message: string
}

export interface ChatSuggestConfig {
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
  readonly suggestModelMode: SuggestModelMode
}

/** FIM 提示词使用的语言（说话人标签 / 停止序列随之切换）。 */
export type SuggestLanguage = 'zh' | 'en'

const SPEAKER_LABELS: Record<SuggestLanguage, { user: string; assistant: string }> = {
  zh: { user: '用户', assistant: '助手' },
  en: { user: 'User', assistant: 'Assistant' },
}

/** 说话人文本格式：zh 用全角冒号，en 用半角冒号 + 空格。 */
function speakerText(language: SuggestLanguage, role: 'user' | 'assistant'): string {
  const label = role === 'assistant' ? SPEAKER_LABELS[language].assistant : SPEAKER_LABELS[language].user
  return language === 'zh' ? `${label}：` : `${label}: `
}

/** FIM 停止序列：历史转文本用说话人标记，命中即停，防止模型续写下一位说话人。 */
export function speakerStopSequences(language: SuggestLanguage): readonly string[] {
  return ['user', 'assistant'].map(role => `\n${speakerText(language, role as 'user' | 'assistant')}`)
}

/** 说话人标签前缀变体：大小写、半/全角冒号（实测模型会输出 assistant：/User: 这类变体）。 */
const SPEAKER_START = /^(?:用户|助手|user|assistant)\s*[:：]\s*/iu
/** 文本中部出现的说话人标签变体（前面带换行）：截断用（无 g 标志，exec 只取首个匹配）。 */
const SPEAKER_TURN_BREAK = /(?:\n)(?:用户|助手|user|assistant)\s*[:：]\s*/iu

/**
 * 清洗一条上游补全（2026-08-30 实测驱动）：
 * 1. 按说话人标记截断——API 的 stop 序列不可靠（同构造有时生效、有时带出「\n助手：…」整段回复）；
 *    标签变体（大小写/全角冒号）同样截断（实测 assistant：）；
 * 2. 去前后空白；
 * 3. 以说话人标记开头视为「角色切换」——模型去回复而不是续写草稿，返回 null 丢弃
 *    （实测：新会话草稿 plea → 输出「助手：看起来你的消息好像没发完整…」）。
 * 正常续写原样返回；无法使用返回 null，由调用方丢弃该候选。
 */
export function cleanSuggestion(text: string, language: SuggestLanguage = 'zh'): string | null {
  let value = text
  for (const marker of speakerStopSequences(language)) {
    const at = value.indexOf(marker)
    if (at !== -1) value = value.slice(0, at)
  }
  const loose = SPEAKER_TURN_BREAK.exec(value)
  if (loose !== null && loose.index > 0) value = value.slice(0, loose.index)
  const trimmed = value.replace(/^[\s\uFEFF]+/u, '').replace(/[\s\uFEFF]+$/u, '')
  if (trimmed === '') return null
  if (SPEAKER_START.test(trimmed)) return null
  return trimmed
}

/** 中文句末标点（截断用）；分号不算——分号后面仍是同一句。 */
const TRUNCATE_END_CJK = '。！？'

/**
 * 建议只保留第一句（2026-08-31 用户拍板「续写不要太长」，连续续写靠 Tab 链）：
 * 在首个句末标点处截断（含标点）。中文 。！？ 直接截；英文 .!? 须后随空白/结尾、
 * 且前面 ≥ minLatinChars 字，避免把 e.g. / approx. 这类缩写当句末。无句末标点原样返回。
 */
export function truncateFirstSentence(text: string, minLatinChars = 8): string {
  const value = text.trim()
  for (let index = 0; index < value.length; index++) {
    const char = value[index] ?? ''
    if (TRUNCATE_END_CJK.includes(char)) return value.slice(0, index + 1)
    if ('.!?'.includes(char)) {
      const next = value[index + 1]
      if ((next === undefined || /\s/u.test(next)) && index >= minLatinChars) return value.slice(0, index + 1)
    }
  }
  return value
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
export function normalizeConfig(input: Readonly<Partial<ChatSuggestConfig>> | undefined): ChatSuggestConfig {
  const config: ChatSuggestConfig = {
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
    throw new Error('dsh-chat-suggest: baseURL/model/apiKeyEnv 不能为空')
  }
  for (const [name, value] of Object.entries({
    maxTokens: config.maxTokens,
    requestTimeoutMs: config.requestTimeoutMs,
    maxBodyBytes: config.maxBodyBytes,
    maxPromptChars: config.maxPromptChars,
    suggestionCount: config.suggestionCount,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`dsh-chat-suggest: ${name} 必须是正整数`)
    }
  }
  if (config.suggestionCount > 4) {
    throw new Error('dsh-chat-suggest: suggestionCount 不能超过 4')
  }
  if (typeof config.temperature !== 'number' || !Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) {
    throw new Error('dsh-chat-suggest: temperature 必须是 0-2 之间的数字')
  }
  if (!/^https?:\/\//u.test(config.baseURL)) {
    throw new Error('dsh-chat-suggest: baseURL 必须是 http(s) URL')
  }
  return config
}

/** 安全解析请求体；超限 / 非法 JSON 返回 BAD_BODY。 */
export function parseCompleteBody(body: string, maxBodyBytes: number, maxPromptChars = Number.MAX_SAFE_INTEGER): CompleteRequest | ChatSuggestError {
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
export function validateCompletePayload(value: unknown, maxPromptChars = Number.MAX_SAFE_INTEGER): CompleteRequest | ChatSuggestError {
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
    suggestModelMode: normalizeSuggestModelMode(body.suggestModelMode),
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

function messageRole(message: unknown): 'user' | 'assistant' {
  const role = (message as { role?: unknown }).role
  return role === 'assistant' ? 'assistant' : 'user'
}

/** 近期历史里的一条说话人文本。 */
export interface HistoryTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

/** 取最近对话历史文本（倒序遍历、非空才计数、按条数与字符数裁剪；与 buildPrefixMessages 同一窗口规则）。 */
export function recentHistoryTurns(
  history: readonly unknown[],
  maxMessages = MAX_HISTORY_MESSAGES,
  maxChars = MAX_HISTORY_CHARS,
): HistoryTurn[] {
  const recent: HistoryTurn[] = []
  let chars = 0
  for (const message of [...history].reverse()) {
    if (recent.length >= maxMessages) break
    const text = textFromHistoryMessage(message)
    if (text === '') continue
    if (chars + text.length > maxChars && recent.length > 0) break
    recent.unshift({ role: messageRole(message), text })
    chars += text.length
  }
  return recent
}

/** 对话前缀续写请求里的一条消息；prefix 只允许出现在最后一条 assistant 消息。 */
export interface PrefixMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly prefix?: true
}

/**
 * 构造「对话前缀续写（Beta）」请求的 messages（2026-08-30 深夜从 FIM 切回，实测依据见 AGENTS.md）：
 * 最近对话历史按原生角色进 messages，最后一条 assistant 消息以「用户：草稿」为前缀并标 prefix: true。
 * 官方 prefix 机制强制模型续写这条消息，前缀写成用户说话人开头即可拿到用户口吻——
 * 实测新会话草稿 plea → 输出 ase（补成 please）；而 FIM 纯文本续写无角色语义，同构造被模型以「助手：」口吻回复。
 */
export function buildPrefixMessages(
  history: readonly unknown[],
  draft: string,
  language: SuggestLanguage = 'zh',
  maxMessages = MAX_HISTORY_MESSAGES,
  maxChars = MAX_HISTORY_CHARS,
): PrefixMessage[] {
  const messages: PrefixMessage[] = recentHistoryTurns(history, maxMessages, maxChars)
    .map(turn => ({ role: turn.role, content: turn.text }))
  messages.push({ role: 'assistant', content: `${speakerText(language, 'user')}${draft}`, prefix: true })
  return messages
}

/**
 * 检测退化复读：整段建议是同一短语（1..64 字）反复复制——≥ minRepeats 次完整重复、
 * 覆盖 ≥ minCoverage 的文本（尾部允许是不完整短语，上游常被 max_tokens 截断）。
 * 命中说明模型陷入循环复读（实测：历史含指令时输入 Please 复读「请用中文回复。」×N），建议不可用。
 */
export function hasDegenerateRepeat(text: string, minRepeats = 4, minCoverage = 0.85): boolean {
  const value = text.trim()
  if (value.length < minRepeats) return false
  const maxUnit = Math.min(64, Math.floor(value.length / minRepeats))
  for (let unitLen = 1; unitLen <= maxUnit; unitLen++) {
    const unit = value.slice(0, unitLen)
    let matched = 0
    let repeats = 0
    while (matched < value.length && repeats < 1000) {
      if (value.slice(matched, matched + unitLen) !== unit) break
      matched += unitLen
      repeats++
    }
    if (repeats < minRepeats) continue
    const rest = value.slice(matched)
    if (rest !== '' && !unit.startsWith(rest)) continue
    if (matched >= value.length * minCoverage) return true
  }
  return false
}

/** 归一化：去掉空白与标点符号，只留文字（回声判定用）。 */
function normalizeForEcho(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, '')
}

/**
 * 检测历史回声：建议（归一化后）任一 minOverlap 字窗口连续出现在给定历史文本里，
 * 说明模型在复读/转述历史而非续写草稿（实测：输入 ple 复述聊天区用户刚发过的句子；
 * 输入 ple 转述正在讨论的插件实现细节——「cleanSuggestion 按说话人标记处理」）。
 * 窗口匹配而非前缀锚定：模型常把原句改写后再复读，前缀对不上但片段仍在。
 * host 侧传近期用户 + 助手消息文本（含助手——2026-08-31 实测仅比用户消息拦不住转述）。
 */
export function isHistoryEcho(suggestion: string, historyTexts: readonly string[], minOverlap = 10): boolean {
  const text = normalizeForEcho(suggestion)
  if (text.length < minOverlap) return false
  const normalizedHistory = historyTexts.map(entry => normalizeForEcho(entry))
  for (let start = 0; start <= text.length - minOverlap; start++) {
    const windowText = text.slice(start, start + minOverlap)
    if (normalizedHistory.some(entry => entry.includes(windowText))) return true
  }
  return false
}

/** 把上游 HTTP 状态映射为插件错误码。 */
export function upstreamStatusToError(status: number, bodyText: string): ChatSuggestError {
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
export const SUGGEST_MODEL_IDS = ['deepseek-v4-pro', 'deepseek-v4-flash'] as const

/** 续写模型三档选择（客户端偏好，随请求传给 host）。 */
export type SuggestModelMode = 'auto' | 'pro' | 'flash'
export const DEFAULT_SUGGEST_MODEL_MODE: SuggestModelMode = 'auto'

/** 请求体里的 suggestModelMode 解析：非法/缺省回退 auto。 */
export function normalizeSuggestModelMode(value: unknown): SuggestModelMode {
  return value === 'auto' || value === 'pro' || value === 'flash' ? value : DEFAULT_SUGGEST_MODEL_MODE
}

/**
 * 补全模型解析（三档，见 docs/spec/04-sensitivity.md）：
 * pro/flash 恒用对应模型；auto 跟随官方主模型（pro/flash），vision / 未知回退配置默认。
 */
export function resolveSuggestModel(mode: SuggestModelMode, main: { provider: string; model: string } | undefined, configuredModel: string): string {
  if (mode === 'pro') return 'deepseek-v4-pro'
  if (mode === 'flash') return 'deepseek-v4-flash'
  if (main !== undefined && main.provider === 'deepseek-official' && (SUGGEST_MODEL_IDS as readonly string[]).includes(main.model)) {
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

/** 触发形态门控：草稿最短长度（trim 后）。标准档 CJK 草稿 10 字；纯拉丁草稿 6 字符（≈一个完整单词——2026-08-31 实测半词信号太弱、模型漂移，拉丁定格 6：好案例 please 恰好 6 字符）。 */
export const MIN_TRIGGER_DRAFT_CHARS = 10
export const MIN_TRIGGER_DRAFT_CHARS_LATIN = 6

/** 句末标点：草稿以这些字符结尾时句子已完整，FIM 会续出新一句而不是接话（实测质量差），不触发。 */
export const SENTENCE_END_CHARS = '。！？.!?;；'

/** CJK 字符检测：草稿含中日韩文字即按「中文语境」门控（2026-08-30 晚：不做 zh/en 硬切换，按内容自适应）。 */
const CJK_CHARS = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u

/** 触发灵敏度三档（2026-08-30 晚）：用户习惯不同，敏锐/钝化自己调。 */
export type TriggerSensitivity = 'eager' | 'standard' | 'conservative'
export const DEFAULT_TRIGGER_SENSITIVITY: TriggerSensitivity = 'standard'

export interface TriggerSensitivityParams {
  /** 停顿阈值（毫秒）。 */
  readonly pauseMs: number
  /** 含 CJK 草稿的最短长度。 */
  readonly minCharsCjk: number
  /** 纯拉丁草稿的最短长度。 */
  readonly minCharsLatin: number
  /** 是否放行「停在一个拉丁单词中间」（仅 CJK 草稿中夹入的英文词受此约束；纯拉丁草稿始终放行）。 */
  readonly allowLatinMidWord: boolean
  /** 是否放行尾随空格（词后预测下一个词 / 空格分词续写）。 */
  readonly allowTrailingSpace: boolean
  /** 是否放行句末标点结尾（高档「什么都想续」；中低档续新一句质量差，抑制）。 */
  readonly allowSentenceEnd: boolean
}

export const TRIGGER_SENSITIVITIES: Record<TriggerSensitivity, TriggerSensitivityParams> = {
  eager: {
    pauseMs: 250,
    minCharsCjk: 6,
    minCharsLatin: 4,
    allowLatinMidWord: true,
    allowTrailingSpace: true,
    allowSentenceEnd: true,
  },
  standard: {
    pauseMs: 400,
    minCharsCjk: MIN_TRIGGER_DRAFT_CHARS,
    minCharsLatin: MIN_TRIGGER_DRAFT_CHARS_LATIN,
    allowLatinMidWord: false,
    allowTrailingSpace: true,
    allowSentenceEnd: false,
  },
  conservative: {
    pauseMs: 800,
    minCharsCjk: 14,
    minCharsLatin: 10,
    allowLatinMidWord: false,
    allowTrailingSpace: false,
    allowSentenceEnd: false,
  },
}

/** 灵敏度解析：非法/缺省回退 standard。 */
export function normalizeTriggerSensitivity(value: unknown): TriggerSensitivity {
  return value === 'eager' || value === 'standard' || value === 'conservative' ? value : DEFAULT_TRIGGER_SENSITIVITY
}

export type SuggestTriggerDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'empty' | 'too-short' | 'sentence-end' | 'mid-word' | 'trailing-space' }

/**
 * 依据草稿形态决定是否发起联想请求（2026-08-30 实测驱动，同日晚改为内容自适应 + 灵敏度可调）：
 * 句末标点 / 尾随空格 / 夹入英文半词 / 最短长度均按灵敏度参数伸缩，停顿阈值由客户端按同一参数取值。
 * 所有语言同一规则。
 */
export function shouldTriggerSuggest(draft: string, sensitivity: TriggerSensitivity = DEFAULT_TRIGGER_SENSITIVITY): SuggestTriggerDecision {
  const params = TRIGGER_SENSITIVITIES[sensitivity] ?? TRIGGER_SENSITIVITIES[DEFAULT_TRIGGER_SENSITIVITY]
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
  // 正停在一个字符上：CJK 草稿里夹入的英文单词续一半质量差，仅低档抑制（高/中档放行）。
  if (cjk && !params.allowLatinMidWord) {
    const prev = trimmed[trimmed.length - 2] ?? ''
    if (/[A-Za-z0-9]/u.test(last) && /[A-Za-z0-9]/u.test(prev)) return { ok: false, reason: 'mid-word' }
  }
  return { ok: true }
}

/** 超时错误是否应映射为 TIMEOUT。 */
export function isAbortTimeout(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
}
