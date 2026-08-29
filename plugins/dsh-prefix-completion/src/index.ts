/** dsh-prefix-completion 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { PrefixCompletionConfig, PrefixCompletionError } from './prefix-completion.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildChatPrefixMessages, extractSuggestions, isStaleResponse, normalizeConfig, parseCompleteBody, upstreamStatusToError, validateCompletePayload } from './prefix-completion.js'
