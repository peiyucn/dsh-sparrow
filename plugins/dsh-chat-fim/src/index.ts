/** dsh-chat-fim 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { ChatFimConfig, ChatFimError, HistoryTurn, PrefixMessage } from './chat-fim.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildPrefixMessages, cleanSuggestion, extractSuggestions, fimStopSequences, hasDegenerateRepeat, isHistoryEcho, normalizeConfig, parseCompleteBody, recentHistoryTurns, upstreamStatusToError, validateCompletePayload } from './chat-fim.js'
