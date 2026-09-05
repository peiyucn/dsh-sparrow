import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { anchorPointsEqual, rectsEqual } from '../lib/client/geometry.js'

describe('geometry 只读测量几何比较（高频回调去重）', () => {
  describe('rectsEqual', () => {
    it('相同数值 应该 相等', () => {
      assert.equal(
        rectsEqual({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 4 }),
        true,
      )
    })

    it('任一字段不同 应该 不相等', () => {
      assert.equal(
        rectsEqual({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 5 }),
        false,
      )
    })

    it('null 只与 null 相等', () => {
      assert.equal(rectsEqual(null, null), true)
      assert.equal(rectsEqual(null, { x: 0, y: 0, width: 0, height: 0 }), false)
      assert.equal(rectsEqual({ x: 0, y: 0, width: 0, height: 0 }, null), false)
    })
  })

  describe('anchorPointsEqual', () => {
    it('相同数值 应该 相等', () => {
      assert.equal(anchorPointsEqual({ x: 10, y: 20, up: true }, { x: 10, y: 20, up: true }), true)
    })

    it('x/y/up 任一不同 应该 不相等', () => {
      assert.equal(anchorPointsEqual({ x: 10, y: 20, up: true }, { x: 11, y: 20, up: true }), false)
      assert.equal(anchorPointsEqual({ x: 10, y: 20, up: true }, { x: 10, y: 21, up: true }), false)
      assert.equal(anchorPointsEqual({ x: 10, y: 20, up: true }, { x: 10, y: 20, up: false }), false)
    })

    it('null 只与 null 相等', () => {
      assert.equal(anchorPointsEqual(null, null), true)
      assert.equal(anchorPointsEqual(null, { x: 0, y: 0, up: false }), false)
      assert.equal(anchorPointsEqual({ x: 0, y: 0, up: false }, null), false)
    })
  })
})
