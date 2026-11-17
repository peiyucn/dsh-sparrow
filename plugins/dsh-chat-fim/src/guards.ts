

import { ECHO_USER_PREFIX_CHARS } from './constants.js'
import { containsCjk } from './prompt.js'
import type { ChatFimError } from './upstream.js'

export interface CompleteRequest {
  readonly sessionId: string
  readonly prompt: string
}


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


function normalizeForEcho(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, '')
}


export function isHistoryEcho(suggestion: string, historyTexts: readonly string[], minOverlap = ECHO_USER_PREFIX_CHARS): boolean {
  const text = normalizeForEcho(suggestion)
  if (text.length < minOverlap) return false
  const normalizedHistory = historyTexts.map(entry => normalizeForEcho(entry))
  for (let start = 0; start <= text.length - minOverlap; start++) {
    const windowText = text.slice(start, start + minOverlap)
    if (normalizedHistory.some(entry => entry.includes(windowText))) return true
  }
  return false
}


export function startsWithHistoryEcho(suggestion: string, historyTexts: readonly string[], minOverlap = ECHO_USER_PREFIX_CHARS): boolean {
  const text = normalizeForEcho(suggestion)
  if (text.length < minOverlap) return false
  const prefix = text.slice(0, minOverlap)
  return historyTexts.some(entry => normalizeForEcho(entry).includes(prefix))
}


export function isLanguageConsistent(draft: string, suggestion: string): boolean {
  if (containsCjk(draft)) return true
  return !containsCjk(suggestion)
}
