import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countVisibleRows } from '../lib/client/paging.js'

describe('countVisibleRows（spec 09）', () => {
  const tree = [
    { id: 'a', children: [{ id: 'a1', children: [] }, { id: 'a2', children: [{ id: 'a2x', children: [] }] }] },
    { id: 'b', children: [] },
  ]

  it('全展开时计全部行（含嵌套子行）', () => {
    assert.equal(countVisibleRows(tree, node => node.children, () => false), 5)
  })

  it('折叠的父节点不计其子树', () => {
    const collapsed = new Set(['a', 'a2'])
    assert.equal(countVisibleRows(tree, node => node.children, node => collapsed.has(node.id)), 2)
  })

  it('空根返回 0', () => {
    assert.equal(countVisibleRows([], node => [], () => false), 0)
  })
})
