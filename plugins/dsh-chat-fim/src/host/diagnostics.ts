

import { MAX_DIAGNOSTIC_SESSIONS } from '../constants.js'

export type DiagnosticKey = 'requests' | 'fulfilled' | 'retries' | 'shown' | 'empty' | 'filteredSpeaker' | 'filteredRepeat' | 'filteredEcho' | 'filteredLanguage' | 'aborted' | 'timeout' | 'upstreamError'


type DiagnosticCounts = Record<DiagnosticKey, number>


type DiagnosticState = DiagnosticCounts & {
  bySession: Record<string, DiagnosticCounts>
  elapsedTotalMs: number
  elapsedMaxMs: number
}

function emptyCounts(): DiagnosticCounts {
  return {
    requests: 0,
    fulfilled: 0,
    retries: 0,
    shown: 0,
    empty: 0,
    filteredSpeaker: 0,
    filteredRepeat: 0,
    filteredEcho: 0,
    filteredLanguage: 0,
    aborted: 0,
    timeout: 0,
    upstreamError: 0,
  }
}

const diagnostics: DiagnosticState = {
  ...emptyCounts(),
  bySession: {},
  elapsedTotalMs: 0,
  elapsedMaxMs: 0,
}


export function bumpSessionDiagnostics(
  bySession: Record<string, DiagnosticCounts>,
  sessionId: string,
  key: DiagnosticKey,
  maxSessions = MAX_DIAGNOSTIC_SESSIONS,
): void {
  let stats = bySession[sessionId]
  if (stats === undefined) {
    while (Object.keys(bySession).length >= maxSessions) {
      const oldest = Object.keys(bySession)[0]
      if (oldest === undefined) break
      delete bySession[oldest]
    }
    stats = emptyCounts()
    bySession[sessionId] = stats
  }
  stats[key]++
}


export function bumpDiagnostics(key: DiagnosticKey, sessionId: string): void {
  diagnostics[key]++
  bumpSessionDiagnostics(diagnostics.bySession, sessionId, key)
}


export function recordElapsed(elapsedMs: number): void {
  diagnostics.elapsedTotalMs += elapsedMs
  if (elapsedMs > diagnostics.elapsedMaxMs) diagnostics.elapsedMaxMs = elapsedMs
}


export function diagnosticsSnapshot(): DiagnosticState {
  return diagnostics
}
