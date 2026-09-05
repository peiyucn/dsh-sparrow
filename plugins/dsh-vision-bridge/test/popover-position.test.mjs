import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { repositionDecision } from '../lib/client/popover-position.js'

/**
 * 弹层重定位决策：滚动/缩放高频事件的「关弹层 / 跳过 setState / 更新定位」
 * 分支全覆盖。rAF 调度留在组件里（node:test 无 DOM），决策本身是纯逻辑。
 */
describe('popover-position 弹层重定位决策', () => {
  it('按钮矩形读不到（next=null）应该 close（关弹层、摘监听）', () => {
    assert.equal(repositionDecision(null, null), 'close')
    assert.equal(repositionDecision({ x: 10, y: 20, up: false }, null), 'close')
  })

  it('首次定位（无上次位置）应该 apply', () => {
    assert.equal(repositionDecision(null, { x: 10, y: 20, up: false }), 'apply')
  })

  it('位置未变 应该 skip（不 setState、不重渲染）', () => {
    const prev = { x: 10, y: 20, up: false }
    assert.equal(repositionDecision(prev, { x: 10, y: 20, up: false }), 'skip')
  })

  it('位置任一轴变化 应该 apply', () => {
    const prev = { x: 10, y: 20, up: false }
    assert.equal(repositionDecision(prev, { x: 11, y: 20, up: false }), 'apply')
    assert.equal(repositionDecision(prev, { x: 10, y: 21, up: false }), 'apply')
    assert.equal(repositionDecision(prev, { x: 10, y: 20, up: true }), 'apply')
  })
})
