/**
 * 上游面：单次补全请求、并行温度扇出、候选护栏清洗、升温度重试。
 * 错误映射与 usage/候选解析是纯逻辑（src/upstream.ts），这里只做 host 侧编排与诊断记账。
 */

import { ECHO_ASSISTANT_WINDOW_CHARS, ECHO_USER_PREFIX_CHARS } from '../constants.js'
import type { ChatFimConfig } from '../config.js'
import { hasDegenerateRepeat, isHistoryEcho, isLanguageConsistent, startsWithHistoryEcho } from '../guards.js'
import { cleanSuggestion, truncateFirstSentence, type SuggestLanguage } from '../prompt.js'
import {
  MAX_UPSTREAM_BODY_BYTES, extractSuggestions, extractUsage, isChatFimError, upstreamStatusToError,
  type ChatFimError,
} from '../upstream.js'
import { bumpDiagnostics } from './diagnostics.js'
import { abortedOutcome, readBoundedText } from './http.js'

/** 候选全被复读/回声护栏过滤时的重试温度：0.5——比 0.3 更易跳出复读循环，比 0.7 噪声小（0.7 实测相关性弱）。 */
export const ECHO_RETRY_TEMPERATURE = 0.5
/** 并行请求温度错开步长（suggestionCount > 1 时生效，步长 0.4 实测多样性足够）。 */
const TEMPERATURE_SPREAD_STEP = 0.4
/** 采样温度上限（DeepSeek API 允许范围 0-2）。 */
const MAX_TEMPERATURE = 2

/** 一次补全请求的固定参数（各并行请求只差 temperature）。 */
export interface CompletionPlan {
  readonly settings: ChatFimConfig
  readonly credentialValue: string
  readonly model: string
  readonly prompt: string
  readonly stop: readonly string[]
  readonly signal: AbortSignal
}

/** 单次上游请求的成果。 */
export interface CompletionResult {
  readonly suggestions: string[]
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number }
  readonly temperature: number
}

/** 本次并行请求的温度序列：单建议不扇出，多建议按步长错开并封顶 2。 */
export function temperaturesFor(settings: ChatFimConfig): number[] {
  return Array.from({ length: settings.suggestionCount }, (_, index) => (
    settings.suggestionCount > 1
      ? Math.min(MAX_TEMPERATURE, settings.temperature + index * TEMPERATURE_SPREAD_STEP)
      : settings.temperature
  ))
}

/** 单次上游补全请求；成功返回候选/用量，失败抛 ChatFimError。 */
export async function requestCompletion(plan: CompletionPlan, temperature: number): Promise<CompletionResult> {
  const upstream = await fetch(`${plan.settings.baseURL.replace(/\/$/u, '')}/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${plan.credentialValue}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: plan.model,
      prompt: plan.prompt,
      max_tokens: plan.settings.maxTokens,
      stop: plan.stop,
      temperature,
    }),
    signal: plan.signal,
  })
  const upstreamText = await readBoundedText(upstream, MAX_UPSTREAM_BODY_BYTES)
  if (!upstream.ok) {
    throw upstreamStatusToError(upstream.status, upstreamText)
  }
  let data: unknown
  try {
    data = JSON.parse(upstreamText)
  } catch {
    throw { code: 'UPSTREAM_ERROR', message: 'DeepSeek 续写上游返回了非法 JSON' } satisfies ChatFimError
  }
  return { suggestions: extractSuggestions(data), usage: extractUsage(data), temperature }
}

/** 一次请求周期内的候选累积状态（跨初始扇出与重试共享）。 */
export interface CandidateState {
  readonly suggestions: string[]
  readonly seen: Set<string>
  totalPromptTokens: number
  totalCompletionTokens: number
  /** 首条成功结果实际使用的温度（无成功结果时保留配置默认，随 200 空数组返回）。 */
  temperature: number
  /** 首个非中止类上游错误（全失败时作为 502 的 error 体）。 */
  firstError?: ChatFimError
  hadFulfilled: boolean
}

export function createCandidateState(fallbackTemperature: number): CandidateState {
  return {
    suggestions: [],
    seen: new Set<string>(),
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    temperature: fallbackTemperature,
    hadFulfilled: false,
  }
}

/** 候选清洗所需的本轮上下文（语言、草稿、回声历史窗口、诊断键）。 */
export interface CandidateGuards {
  readonly draft: string
  readonly language: SuggestLanguage
  readonly userEchoTexts: readonly string[]
  readonly assistantEchoTexts: readonly string[]
  readonly sessionKey: string
}

/** 把一批上游结果经护栏清洗进候选列表（说话人标记剥离、复读/回声丢弃、去重）。 */
export function absorbResults(
  state: CandidateState,
  results: readonly PromiseSettledResult<CompletionResult>[],
  guards: CandidateGuards,
  signal: AbortSignal,
): void {
  for (const result of results) {
    if (result.status === 'fulfilled') {
      state.hadFulfilled = true
      bumpDiagnostics('fulfilled', guards.sessionKey)
      if (state.suggestions.length === 0) state.temperature = result.value.temperature
      state.totalPromptTokens += result.value.usage.promptTokens
      state.totalCompletionTokens += result.value.usage.completionTokens
      for (const suggestion of result.value.suggestions) {
        // 按说话人标记截断 + 角色切换丢弃（API stop 实测不可靠，见 prompt.ts 注释）。
        const clean = cleanSuggestion(suggestion, guards.language)
        if (clean === null) {
          bumpDiagnostics('filteredSpeaker', guards.sessionKey)
          continue
        }
        if (state.seen.has(clean)) continue
        // 语言一致性：草稿纯拉丁时建议不得含中文（实测 please 后空格模型续中文，见 guards.ts）。
        if (!isLanguageConsistent(guards.draft, clean)) {
          bumpDiagnostics('filteredLanguage', guards.sessionKey)
          continue
        }
        // 护栏：同一短语循环复读 → 丢弃；开头复述用户消息（10 字前缀）或
        // 窗口转述助手消息（15 字）→ 丢弃。
        if (hasDegenerateRepeat(clean)) {
          bumpDiagnostics('filteredRepeat', guards.sessionKey)
          continue
        }
        if (startsWithHistoryEcho(clean, guards.userEchoTexts, ECHO_USER_PREFIX_CHARS) || isHistoryEcho(clean, guards.assistantEchoTexts, ECHO_ASSISTANT_WINDOW_CHARS)) {
          bumpDiagnostics('filteredEcho', guards.sessionKey)
          continue
        }
        // 单句截断：续写只给一句，连续续写靠 Tab 链（见 prompt.ts truncateFirstSentence）。
        const short = truncateFirstSentence(clean)
        if (short === '' || state.seen.has(short)) continue
        state.seen.add(short)
        state.suggestions.push(short)
      }
      continue
    }
    const reason = result.reason
    if (state.firstError !== undefined) continue
    // 中止（超时 / 客户端断开）不是「上游报错」：它的出口是 504 / destroy，
    // 由 routes 的中止短路处理（判定函数见 host/http.ts 的 abortedOutcome），故不当候选错误记（否则会和 502 抢出口）。
    if (abortedOutcome(signal) !== undefined) continue
    state.firstError = isChatFimError(reason)
      ? reason
      : { code: 'UPSTREAM_ERROR', message: reason instanceof Error ? reason.message : String(reason) }
  }
}
