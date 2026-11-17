

import {
  FIM_SUPPORT_UNKNOWN_RETRY_FACTOR, FIM_SUPPORT_UNKNOWN_RETRY_MS, FIM_SUPPORT_UNKNOWN_RETRIES,
} from '../constants.js'


export { FIM_SUPPORT_UNKNOWN_RETRY_FACTOR, FIM_SUPPORT_UNKNOWN_RETRY_MS, FIM_SUPPORT_UNKNOWN_RETRIES }

export interface FimSupportAddress {
  readonly sessionId: string

  readonly modelKey: string
}

export type FimSupportPhase = 'idle' | 'checking' | 'retrying' | 'supported' | 'unsupported' | 'failed'

export interface FimSupportState {
  readonly phase: FimSupportPhase
  readonly address: FimSupportAddress

  readonly shown: boolean

  readonly attempts: number
}

export type FimSupportEvent =
  | { readonly type: 'context-changed'; readonly address: FimSupportAddress }
  | { readonly type: 'checked'; readonly address: FimSupportAddress; readonly supported: boolean }
  | { readonly type: 'unknown'; readonly address: FimSupportAddress }
  | { readonly type: 'retry-tick'; readonly address: FimSupportAddress }


export function fimSupportRetryDelayMs(
  attempt: number,
  baseMs: number = FIM_SUPPORT_UNKNOWN_RETRY_MS,
  factor: number = FIM_SUPPORT_UNKNOWN_RETRY_FACTOR,
): number {
  const safeBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : FIM_SUPPORT_UNKNOWN_RETRY_MS
  const safeFactor = Number.isFinite(factor) && factor > 1 ? factor : FIM_SUPPORT_UNKNOWN_RETRY_FACTOR
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.trunc(attempt)) : 1
  return safeBase * safeFactor ** (safeAttempt - 1)
}

export const initialFimSupportState: FimSupportState = {
  phase: 'idle',
  address: { sessionId: '', modelKey: '' },

  shown: false,
  attempts: 0,
}

function sameAddress(left: FimSupportAddress, right: FimSupportAddress): boolean {
  return left.sessionId === right.sessionId && left.modelKey === right.modelKey
}


export function fimSupportReducer(state: FimSupportState, event: FimSupportEvent): FimSupportState {
  if (event.type === 'context-changed') {
    return { phase: 'checking', address: event.address, shown: state.shown, attempts: 0 }
  }
  if (state.phase === 'idle') return state
  if (!sameAddress(state.address, event.address)) return state
  if (event.type === 'retry-tick') {
    if (state.phase !== 'retrying') return state
    return { phase: 'checking', address: state.address, shown: state.shown, attempts: state.attempts }
  }
  if (state.phase !== 'checking') return state
  if (event.type === 'unknown') {

    return state.attempts >= FIM_SUPPORT_UNKNOWN_RETRIES
      ? { phase: 'failed', address: state.address, shown: true, attempts: state.attempts }
      : { phase: 'retrying', address: state.address, shown: state.shown, attempts: state.attempts + 1 }
  }
  return {
    phase: event.supported ? 'supported' : 'unsupported',
    address: state.address,
    shown: event.supported,
    attempts: state.attempts,
  }
}

export function fimSupportShown(state: FimSupportState): boolean {
  return state.shown
}
