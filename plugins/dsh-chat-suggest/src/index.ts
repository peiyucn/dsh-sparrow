/** dsh-chat-suggest 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { ChatSuggestConfig, ChatSuggestError, HistoryTurn, PrefixMessage } from './suggest.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildPrefixMessages, cleanSuggestion, extractSuggestions, speakerStopSequences, hasDegenerateRepeat, isHistoryEcho, normalizeConfig, parseCompleteBody, recentHistoryTurns, upstreamStatusToError, validateCompletePayload } from './suggest.js'
