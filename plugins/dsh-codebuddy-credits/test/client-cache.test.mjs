import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boundedSet } from '../lib/client/CodeBuddyCreditsStats.js'

describe('boundedSet（会话级缓存有界，审计「按会话累积状态」条目）', () => {
  it('上限内正常写入', () => {
    const map = new Map()
    boundedSet(map, 'a', 1, 3)
    boundedSet(map, 'b', 2, 3)
    assert.deepEqual([...map.entries()], [['a', 1], ['b', 2]])
  })

  it('超过上限按 FIFO 淘汰最老条目', () => {
    const map = new Map()
    boundedSet(map, 'a', 1, 3)
    boundedSet(map, 'b', 2, 3)
    boundedSet(map, 'c', 3, 3)
    boundedSet(map, 'd', 4, 3)
    assert.deepEqual([...map.entries()], [['b', 2], ['c', 3], ['d', 4]])
  })

  it('重复键先删后插，刷新到最新位置', () => {
    const map = new Map()
    boundedSet(map, 'a', 1, 3)
    boundedSet(map, 'b', 2, 3)
    boundedSet(map, 'c', 3, 3)
    boundedSet(map, 'b', 20, 3)
    assert.deepEqual([...map.entries()], [['a', 1], ['c', 3], ['b', 20]])
  })

  it('max 为 1 时只保留最新条目', () => {
    const map = new Map()
    boundedSet(map, 'a', 1, 1)
    boundedSet(map, 'b', 2, 1)
    assert.deepEqual([...map.entries()], [['b', 2]])
  })
})
