

import { containsCjk } from './prompt.js'


export const MIN_TRIGGER_DRAFT_CHARS = 8
export const MIN_TRIGGER_DRAFT_CHARS_LATIN = 6


export const SENTENCE_END_CHARS = '。！？.!?;；'


export type TriggerSensitivity = 'eager' | 'standard' | 'conservative'
export const DEFAULT_TRIGGER_SENSITIVITY: TriggerSensitivity = 'standard'

export interface TriggerSensitivityParams {

  readonly pauseMs: number

  readonly minCharsCjk: number

  readonly minCharsLatin: number

  readonly allowLatinMidWord: boolean

  readonly allowTrailingSpace: boolean

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


export function normalizeTriggerSensitivity(value: unknown): TriggerSensitivity {
  return value === 'eager' || value === 'standard' || value === 'conservative' ? value : DEFAULT_TRIGGER_SENSITIVITY
}

export type SuggestTriggerDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'empty' | 'too-short' | 'sentence-end' | 'mid-word' | 'trailing-space' }


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

  const rawLast = draft[draft.length - 1] ?? ''
  if (rawLast.trim() === '') {
    return params.allowTrailingSpace ? { ok: true } : { ok: false, reason: 'trailing-space' }
  }

  if (cjk && !params.allowLatinMidWord) {
    const prev = trimmed[trimmed.length - 2] ?? ''
    if (/[A-Za-z0-9]/u.test(last) && /[A-Za-z0-9]/u.test(prev)) return { ok: false, reason: 'mid-word' }
  }
  return { ok: true }
}


export interface DraftOccurrenceLike {
  readonly offset: number
  readonly length: number
}


export function detectEndOfDraft(draft: string, occurrences: readonly DraftOccurrenceLike[]): number {
  let detect = draft.length
  for (const occurrence of occurrences) {

    detect -= Math.max(1, occurrence.length) - 1
  }
  return detect
}
