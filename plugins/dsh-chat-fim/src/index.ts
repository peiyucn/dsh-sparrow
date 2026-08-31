/** dsh-chat-fim 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { ChatFimConfig, ChatFimError, HistoryTurn } from './suggest.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildFimPrompt, cleanSuggestion, detectDraftLanguage, extractSuggestions, speakerStopSequences, hasDegenerateRepeat, isHistoryEcho, isLanguageConsistent, normalizeConfig, parseCompleteBody, recentHistoryTurns, startsWithHistoryEcho, truncateFirstSentence, upstreamStatusToError, validateCompletePayload } from './suggest.js'
