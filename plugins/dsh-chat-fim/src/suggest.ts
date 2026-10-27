/**
 * 纯逻辑 facade：把配置 / prompt / 护栏 / 上游契约 / 触发 / 格式化各自的公开符号按原路径 re-export。
 *
 * 为什么保留这一层：host 与 client 都从 `./suggest.js` 取纯函数，测试也钉着这些名字；
 * 拆分成关注点模块后，调用方不必跟着搬家。**本文件（及它 re-export 的模块）不得出现 Node 依赖** ——
 * 按字节数校验请求体的 `parseCompleteBody` 依赖 `Buffer`，已移到 host 侧的 `host/http.ts`。
 */

export { DEFAULT_MAX_BODY_BYTES, DEFAULT_REQUEST_TIMEOUT_MS } from './constants.js'

export {
  DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_MAX_PROMPT_CHARS, DEFAULT_MAX_TOKENS, DEFAULT_MODEL,
  DEFAULT_SUGGESTION_COUNT, DEFAULT_TEMPERATURE, normalizeConfig,
} from './config.js'
export type { ChatFimConfig } from './config.js'

export {
  MAX_HISTORY_CHARS, MAX_HISTORY_MESSAGES, buildFimPrompt, cleanSuggestion, detectDraftLanguage,
  recentHistoryTurns, speakerStopSequences, truncateFirstSentence,
} from './prompt.js'
export type { HistoryTurn, SuggestLanguage } from './prompt.js'

export {
  hasDegenerateRepeat, isHistoryEcho, isLanguageConsistent, startsWithHistoryEcho, validateCompletePayload,
} from './guards.js'
export type { CompleteRequest } from './guards.js'

export {
  MAX_UPSTREAM_BODY_BYTES, SUGGEST_MODEL_IDS, currentMainRoute, extractSuggestions, extractUsage,
  isAbortTimeout, isDeepseekMainRoute, mainRouteFromHeader, resolveSuggestModel, summarizeUpstreamBody,
  upstreamStatusToError,
} from './upstream.js'
export type { ChatFimError, ChatFimErrorCode } from './upstream.js'

export {
  DEFAULT_TRIGGER_SENSITIVITY, MIN_TRIGGER_DRAFT_CHARS, MIN_TRIGGER_DRAFT_CHARS_LATIN, SENTENCE_END_CHARS,
  TRIGGER_SENSITIVITIES, detectEndOfDraft, normalizeTriggerSensitivity, shouldTriggerSuggest,
} from './trigger.js'
export type { DraftOccurrenceLike, SuggestTriggerDecision, TriggerSensitivity, TriggerSensitivityParams } from './trigger.js'

export { formatTokenCount } from './format.js'
