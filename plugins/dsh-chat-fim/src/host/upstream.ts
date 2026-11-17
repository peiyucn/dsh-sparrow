

import { ECHO_ASSISTANT_WINDOW_CHARS, ECHO_USER_PREFIX_CHARS } from '../constants.js'
import type { ChatFimConfig } from '../config.js'
import { hasDegenerateRepeat, isHistoryEcho, isLanguageConsistent, startsWithHistoryEcho } from '../guards.js'
import { cleanSuggestion, truncateFirstSentence, type SuggestLanguage } from '../prompt.js'
import {
  MAX_UPSTREAM_BODY_BYTES, extractSuggestions, extractUsage, isChatFimError, upstreamStatusToError,
  type ChatFimError,
} from '../upstream.js'
import { bumpDiagnostics } from './diagnostics.js'
import { abortedOutcome, readBoundedText } from './http.js'


export const ECHO_RETRY_TEMPERATURE = 0.5

const TEMPERATURE_SPREAD_STEP = 0.4

const MAX_TEMPERATURE = 2


export interface CompletionPlan {
  readonly settings: ChatFimConfig
  readonly credentialValue: string
  readonly model: string
  readonly prompt: string
  readonly stop: readonly string[]
  readonly signal: AbortSignal
}


export interface CompletionResult {
  readonly suggestions: string[]
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number }
  readonly temperature: number
}


export function temperaturesFor(settings: ChatFimConfig): number[] {
  return Array.from({ length: settings.suggestionCount }, (_, index) => (
    settings.suggestionCount > 1
      ? Math.min(MAX_TEMPERATURE, settings.temperature + index * TEMPERATURE_SPREAD_STEP)
      : settings.temperature
  ))
}


export async function requestCompletion(plan: CompletionPlan, temperature: number): Promise<CompletionResult> {
  const upstream = await fetch(`${plan.settings.baseURL.replace(/\/$/u, '')}/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${plan.credentialValue}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: plan.model,
      prompt: plan.prompt,
      max_tokens: plan.settings.maxTokens,
      stop: plan.stop,
      temperature,
    }),
    signal: plan.signal,
  })
  const upstreamText = await readBoundedText(upstream, MAX_UPSTREAM_BODY_BYTES)
  if (!upstream.ok) {
    throw upstreamStatusToError(upstream.status, upstreamText)
  }
  let data: unknown
  try {
    data = JSON.parse(upstreamText)
  } catch {
    throw { code: 'UPSTREAM_ERROR', message: 'DeepSeek 续写上游返回了非法 JSON' } satisfies ChatFimError
  }
  return { suggestions: extractSuggestions(data), usage: extractUsage(data), temperature }
}


export interface CandidateState {
  readonly suggestions: string[]
  readonly seen: Set<string>
  totalPromptTokens: number
  totalCompletionTokens: number

  temperature: number

  firstError?: ChatFimError
  hadFulfilled: boolean
}

export function createCandidateState(fallbackTemperature: number): CandidateState {
  return {
    suggestions: [],
    seen: new Set<string>(),
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    temperature: fallbackTemperature,
    hadFulfilled: false,
  }
}


export interface CandidateGuards {
  readonly draft: string
  readonly language: SuggestLanguage
  readonly userEchoTexts: readonly string[]
  readonly assistantEchoTexts: readonly string[]
  readonly sessionKey: string
}


export function absorbResults(
  state: CandidateState,
  results: readonly PromiseSettledResult<CompletionResult>[],
  guards: CandidateGuards,
  signal: AbortSignal,
): void {
  for (const result of results) {
    if (result.status === 'fulfilled') {
      state.hadFulfilled = true
      bumpDiagnostics('fulfilled', guards.sessionKey)
      if (state.suggestions.length === 0) state.temperature = result.value.temperature
      state.totalPromptTokens += result.value.usage.promptTokens
      state.totalCompletionTokens += result.value.usage.completionTokens
      for (const suggestion of result.value.suggestions) {

        const clean = cleanSuggestion(suggestion, guards.language)
        if (clean === null) {
          bumpDiagnostics('filteredSpeaker', guards.sessionKey)
          continue
        }
        if (state.seen.has(clean)) continue

        if (!isLanguageConsistent(guards.draft, clean)) {
          bumpDiagnostics('filteredLanguage', guards.sessionKey)
          continue
        }


        if (hasDegenerateRepeat(clean)) {
          bumpDiagnostics('filteredRepeat', guards.sessionKey)
          continue
        }
        if (startsWithHistoryEcho(clean, guards.userEchoTexts, ECHO_USER_PREFIX_CHARS) || isHistoryEcho(clean, guards.assistantEchoTexts, ECHO_ASSISTANT_WINDOW_CHARS)) {
          bumpDiagnostics('filteredEcho', guards.sessionKey)
          continue
        }

        const short = truncateFirstSentence(clean)
        if (short === '' || state.seen.has(short)) continue
        state.seen.add(short)
        state.suggestions.push(short)
      }
      continue
    }
    const reason = result.reason
    if (state.firstError !== undefined) continue


    if (abortedOutcome(signal) !== undefined) continue
    state.firstError = isChatFimError(reason)
      ? reason
      : { code: 'UPSTREAM_ERROR', message: reason instanceof Error ? reason.message : String(reason) }
  }
}
