// @ts-check
/**
 * Panel ↔ conversation bridge: forwards one prompt into the official Workspace blank flow with the
 * append rule, stays inert without the service, and detaches symmetrically.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCoauthorBridge } from '../../lib/client/coauthor.js'

/** One captured `startSession` call. */
/** @typedef {{ workspaceId: unknown, options: unknown }} Call */

describe('和 DSH 一起 bridge', () => {
  it('导航未挂载时 start 返回 false 且不抛错', () => {
    const bridge = createCoauthorBridge()
    assert.equal(bridge.start('帮我记一条便签：'), false)
  })

  it('挂载后 start 用当前工作区 + append 预填，不传发送语义', () => {
    const bridge = createCoauthorBridge()
    /** @type {Call[]} */
    const calls = []
    const detach = bridge.attachNavigation({
      startSession: (workspaceId, options) => { calls.push({ workspaceId, options }) },
    })
    assert.equal(bridge.start('帮我记一条便签：'), true)
    assert.deepEqual(calls, [{
      workspaceId: undefined,
      options: { prompt: '帮我记一条便签：', whenDraftExists: 'append' },
    }])
    detach()
  })

  it('detach 后回到 inert；旧 detach 不会摘掉新挂载的服务', () => {
    const bridge = createCoauthorBridge()
    /** @type {Call[]} */
    const calls = []
    const oldDetach = bridge.attachNavigation({ startSession: () => { calls.push({ workspaceId: 0, options: 0 }) } })
    oldDetach()
    assert.equal(bridge.start('x'), false)

    const newDetach = bridge.attachNavigation({
      startSession: (workspaceId, options) => { calls.push({ workspaceId, options }) },
    })
    // A stale detach from the previous service must not unbind the current one.
    oldDetach()
    assert.equal(bridge.start('y'), true)
    assert.equal(calls.length, 1)
    newDetach()
    assert.equal(bridge.start('z'), false)
  })
})
