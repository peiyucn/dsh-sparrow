// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSessionIndexRecord, sessionIndexId } from '../../../lib/host/sessions/records.js'

describe('会话索引记录', () => {
  it('节点 id 由 sessionId 确定性派生，索引重建不换主键', () => {
    assert.equal(sessionIndexId('abc'), 'session_abc')
    assert.equal(sessionIndexId('abc'), sessionIndexId('abc'))
  })

  it('只存索引字段，不复制会话内容', () => {
    const record = createSessionIndexRecord({
      sessionId: 'abc',
      title: '重构会话树',
      cwd: '~/repo',
      parentSessionId: 'root',
      subagent: true,
      running: false,
      availability: 'archived',
      updatedAt: 123,
    }, { now: '2026-11-09T00:00:00.000Z' })
    assert.deepEqual(record, {
      id: 'session_abc',
      kind: 'session',
      schema: 1,
      sessionId: 'abc',
      title: '重构会话树',
      cwd: '~/repo',
      parentSessionId: 'root',
      subagent: true,
      running: false,
      availability: 'archived',
      updatedAt: 123,
      indexedAt: '2026-11-09T00:00:00.000Z',
      createdAt: '2026-11-09T00:00:00.000Z',
      revision: 1,
    })
    assert.ok(!JSON.stringify(record).includes('transcript'))
  })
})
