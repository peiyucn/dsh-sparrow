/** dsh-fim 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { FimConfig, FimError } from './fim.js'
export { DEFAULT_BASE_URL, DEFAULT_MODEL, buildChatPrefixMessages, extractSuggestions, isStaleResponse, normalizeConfig, parseCompleteBody, upstreamStatusToError, validateCompletePayload } from './fim.js'
