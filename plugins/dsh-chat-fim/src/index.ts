/** dsh-chat-fim 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { ChatFimConfig, ChatFimError } from './chat-fim.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildFimPrompt, extractSuggestions, fimStopSequences, normalizeConfig, parseCompleteBody, upstreamStatusToError, validateCompletePayload } from './chat-fim.js'
