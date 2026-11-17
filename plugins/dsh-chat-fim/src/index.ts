
export { apply, inject, name } from './host.js'
export type { ChatFimConfig, ChatFimError, HistoryTurn } from './suggest.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildFimPrompt, cleanSuggestion, detectDraftLanguage, extractSuggestions, speakerStopSequences, hasDegenerateRepeat, isHistoryEcho, isLanguageConsistent, normalizeConfig, recentHistoryTurns, startsWithHistoryEcho, truncateFirstSentence, upstreamStatusToError, validateCompletePayload } from './suggest.js'

export { parseCompleteBody } from './host/http.js'
export { isLoopbackHostname, isTrustedAuthority, isTrustedBrowserRequest, officialTrustedHosts, parseAuthority } from './trust.js'
