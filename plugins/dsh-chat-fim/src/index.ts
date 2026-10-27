/** dsh-chat-fim 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { ChatFimConfig, ChatFimError, HistoryTurn } from './suggest.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildFimPrompt, cleanSuggestion, detectDraftLanguage, extractSuggestions, speakerStopSequences, hasDegenerateRepeat, isHistoryEcho, isLanguageConsistent, normalizeConfig, recentHistoryTurns, startsWithHistoryEcho, truncateFirstSentence, upstreamStatusToError, validateCompletePayload } from './suggest.js'
/** `parseCompleteBody` 按字节数校验、依赖 Node 的 `Buffer`，留在 host 侧（不进 client 图）。 */
export { parseCompleteBody } from './host/http.js'
export { isLoopbackHostname, isTrustedAuthority, isTrustedBrowserRequest, officialTrustedHosts, parseAuthority } from './trust.js'
