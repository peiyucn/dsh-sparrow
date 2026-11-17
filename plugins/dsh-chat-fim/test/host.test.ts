
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bumpSessionDiagnostics, MAX_DIAGNOSTIC_SESSIONS } from '../lib/host.js'
import type { DiagnosticKey } from '../src/host/diagnostics.ts'

type SessionDiagnostics = Record<DiagnosticKey, number>

describe('bumpSessionDiagnostics 有界按会话诊断表', () => {
  it('会话条目 应该 正确累加', () => {
    const bySession: Record<string, SessionDiagnostics> = {}
    bumpSessionDiagnostics(bySession, 's1', 'requests')
    bumpSessionDiagnostics(bySession, 's1', 'requests')
    bumpSessionDiagnostics(bySession, 's1', 'shown')
    assert.deepEqual(bySession.s1, {
      requests: 2, fulfilled: 0, retries: 0, shown: 1, empty: 0,
      filteredSpeaker: 0, filteredRepeat: 0, filteredEcho: 0, filteredLanguage: 0,
      aborted: 0, timeout: 0, upstreamError: 0,
    })
  })

  it('超过上限 应该 淘汰最早写入的会话（FIFO，表有界）', () => {
    const bySession: Record<string, SessionDiagnostics> = {}
    for (let index = 0; index < MAX_DIAGNOSTIC_SESSIONS + 5; index++) {
      bumpSessionDiagnostics(bySession, `s${index}`, 'requests')
    }
    assert.equal(Object.keys(bySession).length, MAX_DIAGNOSTIC_SESSIONS)
    assert.equal(bySession.s0, undefined)
    assert.equal(bySession.s4, undefined)
    assert.equal(bySession[`s${MAX_DIAGNOSTIC_SESSIONS + 4}`].requests, 1)

    assert.equal(bySession.s5.requests, 1)
  })

  it('淘汰后的会话再次计数 应该 重建条目且不重复', () => {
    const bySession: Record<string, SessionDiagnostics> = {}
    bumpSessionDiagnostics(bySession, 'old', 'requests', 2)
    bumpSessionDiagnostics(bySession, 'a', 'requests', 2)
    bumpSessionDiagnostics(bySession, 'b', 'requests', 2) 
    assert.equal(bySession.old, undefined)
    bumpSessionDiagnostics(bySession, 'old', 'requests', 2) 
    assert.deepEqual(bySession.old, {
      requests: 1, fulfilled: 0, retries: 0, shown: 0, empty: 0,
      filteredSpeaker: 0, filteredRepeat: 0, filteredEcho: 0, filteredLanguage: 0,
      aborted: 0, timeout: 0, upstreamError: 0,
    })
  })
})
