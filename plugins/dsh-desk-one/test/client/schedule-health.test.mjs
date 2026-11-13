// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sourceHealth } from '../../lib/client/schedule/sources/status.js'

/** Minimal source fixture. */
const source = (/** @type {any} */ overrides) => ({ id: 's1', provider: 'icloud', channel: 'caldav', syncState: 'idle', revision: 1, ...overrides })
/** Minimal calendar fixture. */
const calendar = (/** @type {any} */ overrides) => ({ id: 'c1', sourceId: 's1', displayName: 'Work', enabled: true, revision: 1, ...overrides })

describe('日程来源健康状态', () => {
  it('未连接 → off', () => {
    assert.deepEqual(sourceHealth(undefined, []), { tone: 'off', calendarIssues: [] })
  })

  it('来源自身失败 → error，带来源错误信息', () => {
    const health = sourceHealth(source({ syncState: 'error', lastError: { code: 'SCHEDULE_UNAVAILABLE', message: 'Graph 列日历失败：HTTP 502' } }), [])
    assert.equal(health.tone, 'error')
    assert.equal(health.sourceError, 'Graph 列日历失败：HTTP 502')
  })

  it('来源正常但部分日历失败 → warn，列出失败日历', () => {
    const health = sourceHealth(source({}), [
      calendar({ lastError: { code: 'SCHEDULE_UNAVAILABLE', message: 'HTTP 502' } }),
      calendar({ id: 'c2', displayName: 'Home' }),
    ])
    assert.equal(health.tone, 'warn')
    assert.deepEqual(health.calendarIssues, [{ name: 'Work', message: 'HTTP 502' }])
  })

  it('来源与日历都正常 → ok', () => {
    assert.equal(sourceHealth(source({}), [calendar({})]).tone, 'ok')
  })
})
