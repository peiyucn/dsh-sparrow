

export const MAX_HISTORY_MESSAGES = 12
export const MAX_HISTORY_CHARS = 6_000


export type SuggestLanguage = 'zh' | 'en'


const CJK_CHARS = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u


export function containsCjk(text: string): boolean {
  return CJK_CHARS.test(text)
}


export function detectDraftLanguage(draft: string): SuggestLanguage {
  return containsCjk(draft) ? 'zh' : 'en'
}

const SPEAKER_LABELS: Record<SuggestLanguage, { user: string; assistant: string }> = {
  zh: { user: '用户', assistant: '助手' },
  en: { user: 'User', assistant: 'Assistant' },
}


function speakerText(language: SuggestLanguage, role: 'user' | 'assistant'): string {
  const label = role === 'assistant' ? SPEAKER_LABELS[language].assistant : SPEAKER_LABELS[language].user
  return language === 'zh' ? `${label}：` : `${label}: `
}


export function speakerStopSequences(language: SuggestLanguage): readonly string[] {
  return ['user', 'assistant'].map(role => `\n${speakerText(language, role as 'user' | 'assistant')}`)
}


const SPEAKER_START = /^(?:用户|助手|user|assistant)\s*[:：]\s*/iu

const SPEAKER_TURN_BREAK = /(?:\n)(?:用户|助手|user|assistant)\s*[:：]\s*/iu


export function cleanSuggestion(text: string, language: SuggestLanguage = 'zh'): string | null {
  let value = text
  for (const marker of speakerStopSequences(language)) {
    const at = value.indexOf(marker)
    if (at !== -1) value = value.slice(0, at)
  }
  const loose = SPEAKER_TURN_BREAK.exec(value)
  if (loose !== null && loose.index > 0) value = value.slice(0, loose.index)

  const trimmed = value.trim()
  if (trimmed === '') return null
  if (SPEAKER_START.test(trimmed)) return null
  return trimmed
}


const TRUNCATE_END_CJK = '。！？'


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


export interface HistoryTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}


export function recentHistoryTurns(
  history: readonly unknown[],
  maxMessages = MAX_HISTORY_MESSAGES,
  maxChars = MAX_HISTORY_CHARS,
): HistoryTurn[] {
  const recent: HistoryTurn[] = []
  let chars = 0
  for (let index = history.length - 1; index >= 0; index--) {
    if (recent.length >= maxMessages) break
    const message = history[index]
    const text = textFromHistoryMessage(message)
    if (text === '') continue
    if (chars + text.length > maxChars && recent.length > 0) break
    recent.unshift({ role: messageRole(message), text })
    chars += text.length
  }
  return recent
}


export function buildFimPrompt(
  history: readonly unknown[],
  draft: string,
  language: SuggestLanguage = 'zh',
  maxMessages = MAX_HISTORY_MESSAGES,
  maxChars = MAX_HISTORY_CHARS,
): string {
  const transcript = recentHistoryTurns(history, maxMessages, maxChars)
    .map(entry => `${speakerText(language, entry.role)}${entry.text}`)
    .join('\n')
  return `${transcript === '' ? '' : `${transcript}\n\n`}${speakerText(language, 'user')}${draft}`
}
