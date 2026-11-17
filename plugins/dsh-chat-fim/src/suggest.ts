

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
