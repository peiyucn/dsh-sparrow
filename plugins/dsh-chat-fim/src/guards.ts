/** 请求校验与内容护栏：请求体形状、复读 / 回声 / 语言一致性。纯逻辑、无 Node 依赖。 */

import { ECHO_USER_PREFIX_CHARS } from './constants.js'
import { containsCjk } from './prompt.js'
import type { ChatFimError } from './upstream.js'

export interface CompleteRequest {
  readonly sessionId: string
  readonly prompt: string
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

/**
 * 检测退化复读：整段建议是同一短语（1..64 字）反复复制——≥ minRepeats 次完整重复、覆盖 ≥ minCoverage 的文本（尾部允许是不完整短语，上游常被 max_tokens 截断）。
 * 命中说明模型陷入循环复读，建议不可用。
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
 * 检测历史回声（窗口模式）：建议（归一化后）任一 minOverlap 字窗口连续出现在历史文本里，说明模型在复读/转述历史而非续写草稿。
 * host 侧用于助手消息比对（传 ECHO_ASSISTANT_WINDOW_CHARS——10 字窗口误杀正常措辞复用，见 AGENTS.md）。
 */
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

/**
 * 检测「开头回声」（前缀锚定）：建议开头（归一化后）的前 minOverlap 字连续出现在历史文本里。
 * host 侧用于用户消息比对（传 ECHO_USER_PREFIX_CHARS）；只锚定开头——正常续写中段复用用户措辞不误杀（窗口比对会误杀，别改回去）。
 */
export function startsWithHistoryEcho(suggestion: string, historyTexts: readonly string[], minOverlap = ECHO_USER_PREFIX_CHARS): boolean {
  const text = normalizeForEcho(suggestion)
  if (text.length < minOverlap) return false
  const prefix = text.slice(0, minOverlap)
  return historyTexts.some(entry => normalizeForEcho(entry).includes(prefix))
}

/** 语言一致性护栏：草稿纯拉丁时建议不得含 CJK；反向不拦——中文草稿常夹英文术语。 */
export function isLanguageConsistent(draft: string, suggestion: string): boolean {
  if (containsCjk(draft)) return true
  return !containsCjk(suggestion)
}
