/**
 * prompt 面：说话人文本、历史窗口、上游清洗与单句截断。
 * 纯逻辑；`Buffer` 之类的 Node 依赖不在这里（host-only 的字节校验见 host/http.ts）。
 */

export const MAX_HISTORY_MESSAGES = 12
export const MAX_HISTORY_CHARS = 6_000

/** FIM 提示词使用的语言（说话人标签 / 停止序列随之切换）。 */
export type SuggestLanguage = 'zh' | 'en'

/** CJK 字符检测：草稿含中日韩文字即按「中文语境」门控（不做 zh/en 硬切换，按内容自适应）。 */
const CJK_CHARS = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u

/** 是否含 CJK 字符：语言判定与语言一致性护栏共用同一字符类，避免两份正则各自漂移。 */
export function containsCjk(text: string): boolean {
  return CJK_CHARS.test(text)
}

/** 续写语言跟随草稿内容（界面语言不作准）：草稿含 CJK 用中文说话人标签，否则英文标签。 */
export function detectDraftLanguage(draft: string): SuggestLanguage {
  return containsCjk(draft) ? 'zh' : 'en'
}

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

/** 说话人标签前缀变体：大小写、半/全角冒号（模型会输出 assistant：这类变体）。 */
const SPEAKER_START = /^(?:用户|助手|user|assistant)\s*[:：]\s*/iu
/** 文本中部出现的说话人标签变体（前面带换行）：截断用（无 g 标志，exec 只取首个匹配）。 */
const SPEAKER_TURN_BREAK = /(?:\n)(?:用户|助手|user|assistant)\s*[:：]\s*/iu

/**
 * 清洗一条上游补全：按说话人标记截断（API 的 stop 序列不可靠，标签变体也算），去前后空白；
 * 以说话人标记开头视为「模型去回复而非续写草稿」，返回 null 丢弃。无法使用时返回 null。
 */
export function cleanSuggestion(text: string, language: SuggestLanguage = 'zh'): string | null {
  let value = text
  for (const marker of speakerStopSequences(language)) {
    const at = value.indexOf(marker)
    if (at !== -1) value = value.slice(0, at)
  }
  const loose = SPEAKER_TURN_BREAK.exec(value)
  if (loose !== null && loose.index > 0) value = value.slice(0, loose.index)
  // 用原生 trim：同时覆盖 \s 与 BOM 且为线性实现；原先的「尾部 \s+$ 替换」是多项式回溯正则（CodeQL js/polynomial-redos），别改回去。
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (SPEAKER_START.test(trimmed)) return null
  return trimmed
}

/** 中文句末标点（截断用）；分号不算——分号后面仍是同一句。 */
const TRUNCATE_END_CJK = '。！？'

/** 建议只保留第一句：在首个句末标点处截断（含标点）。中文 。！？ 直接截；英文 .!? 须后随空白/结尾且前面 ≥ minLatinChars 字，避免把 e.g. / approx. 这类缩写当句末；无句末标点原样返回。 */
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

/** 取最近对话历史文本（倒序遍历、非空才计数、按条数与字符数裁剪，与 buildFimPrompt 同一窗口规则）；倒序走索引，不复制整段历史。 */
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

/**
 * 构造 FIM 补全 prompt：最近对话历史转成说话人文本（zh「用户：/助手：」、en「User:/Assistant:」），草稿作为最后一个用户说话人的开头。
 * 纯文本续写天然站在用户角度；而前缀接口把「用户：草稿」塞进 assistant 消息会逼模型装用户，造成结构性角色漂移。实测依据见 AGENTS.md。
 */
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
