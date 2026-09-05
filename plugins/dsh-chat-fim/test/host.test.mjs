import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bumpSessionDiagnostics, MAX_DIAGNOSTIC_SESSIONS, isTrustedBrowserRequest } from '../lib/host.js'

describe('isTrustedBrowserRequest 浏览器信任标记检查（官方 /api 栅栏同口径）', () => {
  it('同源 Origin 应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }), true)
  })

  it('跨站 Origin 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'http://evil.example' }), false)
  })

  it('sec-fetch-site 跨站 应该 拒绝（即使无 Origin）', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }), false)
  })

  it('同源 sec-fetch-site 应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }), true)
  })

  it('无浏览器标记（curl 等）应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080' }), true)
  })

  it('origin: null（沙箱 iframe）应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'null' }), false)
  })

  it('非法 Origin 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ host: '127.0.0.1:3080', origin: 'not a url' }), false)
  })

  it('缺 host 应该 拒绝', () => {
    assert.equal(isTrustedBrowserRequest({ origin: 'http://127.0.0.1:3080' }), false)
    assert.equal(isTrustedBrowserRequest({ host: '' }), false)
  })

  it('LAN 同源（host 与 origin 同 authority）应该 放行', () => {
    assert.equal(isTrustedBrowserRequest({ host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' }), true)
  })
})

describe('bumpSessionDiagnostics 有界按会话诊断表', () => {
  it('会话条目 应该 正确累加', () => {
    const bySession = {}
    bumpSessionDiagnostics(bySession, 's1', 'requests')
    bumpSessionDiagnostics(bySession, 's1', 'requests')
    bumpSessionDiagnostics(bySession, 's1', 'shown')
    assert.deepEqual(bySession.s1, {
      requests: 2, fulfilled: 0, retries: 0, shown: 1, empty: 0,
      filteredSpeaker: 0, filteredRepeat: 0, filteredEcho: 0, filteredLanguage: 0,
    })
  })

  it('超过上限 应该 淘汰最早写入的会话（FIFO，表有界）', () => {
    const bySession = {}
    for (let index = 0; index < MAX_DIAGNOSTIC_SESSIONS + 5; index++) {
      bumpSessionDiagnostics(bySession, `s${index}`, 'requests')
    }
    assert.equal(Object.keys(bySession).length, MAX_DIAGNOSTIC_SESSIONS)
    assert.equal(bySession.s0, undefined)
    assert.equal(bySession.s4, undefined)
    assert.equal(bySession[`s${MAX_DIAGNOSTIC_SESSIONS + 4}`].requests, 1)
    // 表中最早的 5 个被淘汰，其余条目保留原计数。
    assert.equal(bySession.s5.requests, 1)
  })

  it('淘汰后的会话再次计数 应该 重建条目且不重复', () => {
    const bySession = {}
    bumpSessionDiagnostics(bySession, 'old', 'requests', 2)
    bumpSessionDiagnostics(bySession, 'a', 'requests', 2)
    bumpSessionDiagnostics(bySession, 'b', 'requests', 2) // 淘汰 old
    assert.equal(bySession.old, undefined)
    bumpSessionDiagnostics(bySession, 'old', 'requests', 2) // old 重建（回到表尾）
    assert.deepEqual(bySession.old, {
      requests: 1, fulfilled: 0, retries: 0, shown: 0, empty: 0,
      filteredSpeaker: 0, filteredRepeat: 0, filteredEcho: 0, filteredLanguage: 0,
    })
  })
})
