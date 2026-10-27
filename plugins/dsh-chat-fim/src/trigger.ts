/** 触发面：三档灵敏度参数、草稿形态门控、草稿末端坐标换算。纯逻辑。 */

import { containsCjk } from './prompt.js'

/** 触发形态门控：CJK 草稿 8 字、纯拉丁草稿 6 字符（完整单词才触发；字母级补全不可靠，半词触发已去掉）。 */
export const MIN_TRIGGER_DRAFT_CHARS = 8
export const MIN_TRIGGER_DRAFT_CHARS_LATIN = 6

/** 句末标点：草稿以这些字符结尾时句子已完整，FIM 会续出新一句而不是接话（质量差），不触发。 */
export const SENTENCE_END_CHARS = '。！？.!?;；'

/** 触发灵敏度三档：用户习惯不同，敏锐/钝化自己调。 */
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
    minCharsCjk: 4,
    minCharsLatin: 2,
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
    minCharsCjk: 12,
    minCharsLatin: 8,
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
 * 依据草稿形态决定是否发起联想请求：句末标点 / 尾随空格 / 夹入英文半词 / 最短长度均按灵敏度参数伸缩，停顿阈值由客户端按同一参数取值；所有语言同一规则。
 */
export function shouldTriggerSuggest(draft: string, sensitivity: TriggerSensitivity = DEFAULT_TRIGGER_SENSITIVITY): SuggestTriggerDecision {
  const params = TRIGGER_SENSITIVITIES[sensitivity] ?? TRIGGER_SENSITIVITIES[DEFAULT_TRIGGER_SENSITIVITY]
  const trimmed = draft.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  const cjk = containsCjk(trimmed)
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

/** Occurrence 最小面（clipboard 坐标；InputState.occurrences 的子集）。 */
export interface DraftOccurrenceLike {
  readonly offset: number
  readonly length: number
}

/**
 * clipboard 坐标的草稿末端 → detect 坐标（TokenSpan 平面）：官方投影里每个 chip 在 detect 文本中只占 1 个字符（U+FFFC，ATOMIC_CHAR 口径），其 clipboard 展开多出的 length-1 个字符全部扣掉；无 chip 时返回 draft.length。
 * 建议只在草稿末端采纳，全部 occurrence 都位于末端之前，按总和扣除即正确。
 */
export function detectEndOfDraft(draft: string, occurrences: readonly DraftOccurrenceLike[]): number {
  let detect = draft.length
  for (const occurrence of occurrences) {
    // 异常输入钳制：length=0 的 occurrence 按 1 字符计（chip 在 detect 平面恒占 1 字符，不因坏数据反向加长末端）。
    detect -= Math.max(1, occurrence.length) - 1
  }
  return detect
}
