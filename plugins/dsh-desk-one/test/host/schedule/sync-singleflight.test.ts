

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ScheduleSync } from '../../../lib/host/schedule/sync.js'
import { OutlookOAuth } from '../../../lib/host/schedule/outlook-oauth.js'


const fakeCtx = () => ({ logger: { warn: () => {}, info: () => {}, debug: () => {} } })


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
    await assert.rejects(oauth().startOutlookLogin('not a url'), (error: unknown) => {
      const failure = error as { code?: string, status?: number }
      assert.equal(failure.code, 'INVALID_SCHEDULE')
      assert.equal(failure.status, 400)
      return true
    })
  })

  it('非本机 callback 地址 应该 被拒绝', async () => {
    await assert.rejects(oauth().startOutlookLogin('http://example.com/api/desk-one/schedule/outlook/callback'), (error: unknown) => {
      const failure = error as { code?: string }
      assert.equal(failure.code, 'INVALID_SCHEDULE')
      return true
    })
  })
})
