// @ts-check
/**
 * Schedule host regression: every sync entry point goes through the per-source single-flight slot,
 * and an invalid OAuth callback address is reported as a validation error instead of a raw TypeError.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ScheduleSync } from '../../../lib/host/schedule/sync.js'
import { OutlookOAuth } from '../../../lib/host/schedule/outlook-oauth.js'

/** Minimal context: these paths only reach the logger. */
const fakeCtx = () => ({ logger: { warn: () => {}, info: () => {}, debug: () => {} } })

/** Minimal store: unknown-provider pulls fail right after the first state write. */
const fakeStore = (calls) => ({
  listScheduleSources: () => [],
  setScheduleSyncState: async () => { calls.syncStates.push(1) },
  upsertCalendars: async () => [],
  syncCalendarEvents: async () => {},
})

describe('日程同步：单飞覆盖所有入口', () => {
  it('并发 syncSource 应该 只跑一次拉取（连接预热 / 按钮点击共享同一单飞槽）', async () => {
    const calls = { syncStates: [] }
    const sync = new ScheduleSync(fakeCtx(), fakeStore(calls), { graphToken: async () => 'token' })
    const source = { id: 'source-1', provider: 'unknown-provider', channel: 'ics', enabled: true }
    const [first, second] = await Promise.all([sync.syncSource(source), sync.syncSource(source)])
    // One pull = "syncing" + final state; a second concurrent pull would double both.
    assert.equal(calls.syncStates.length, 2)
    assert.equal(first.ok, false)
    assert.equal(second.ok, false)
    assert.equal(first.error?.code, 'INVALID_SCHEDULE', '未知 provider 的错误码原样上报')
  })
})

describe('日程 OAuth：回调地址校验', () => {
  const oauth = () => new OutlookOAuth(fakeCtx(), {}, {
    syncSource: async () => ({ ok: true }),
    state: () => ({}),
  })

  it('非法 URL 应该 抛 INVALID_SCHEDULE 而不是原生 TypeError', async () => {
    await assert.rejects(oauth().startOutlookLogin('not a url'), (/** @type {any} */ error) => {
      assert.equal(error.code, 'INVALID_SCHEDULE')
      assert.equal(error.status, 400)
      return true
    })
  })

  it('非本机 callback 地址 应该 被拒绝', async () => {
    await assert.rejects(oauth().startOutlookLogin('http://example.com/api/desk-one/schedule/outlook/callback'), (/** @type {any} */ error) => {
      assert.equal(error.code, 'INVALID_SCHEDULE')
      return true
    })
  })
})
