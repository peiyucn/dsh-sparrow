// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nestTree } from '../lib/tree.js'

const item = (id, parentId) => ({ id, parentId })

describe('nestTree · 会话与归档共用的父子树', () => {
  it('按 parentId 嵌套，父不在集合里的子会话提升为根', () => {
    const roots = nestTree(
      [item('a', 'missing'), item('b', 'a'), item('c', 'b')],
      { idOf: value => value.id, parentIdOf: value => value.parentId },
    )
    assert.deepEqual(roots.map(node => node.value.id), ['a'])
    assert.deepEqual(roots[0]?.children.map(node => node.value.id), ['b'])
    assert.deepEqual(roots[0]?.children[0]?.children.map(node => node.value.id), ['c'])
  })

  it('排序回调分别作用于根与子级', () => {
    const roots = nestTree(
      [item('a'), item('b'), item('kid2', 'b'), item('kid1', 'b')],
      {
        idOf: value => value.id,
        parentIdOf: value => value.parentId,
        sortRoots: (left, right) => right.id.localeCompare(left.id),
        sortChildren: (left, right) => left.id.localeCompare(right.id),
      },
    )
    assert.deepEqual(roots.map(node => node.value.id), ['b', 'a'])
    assert.deepEqual(roots[0]?.children.map(node => node.value.id), ['kid1', 'kid2'])
  })

  it('父链成环时提升一个节点为根而不是无限递归', () => {
    const roots = nestTree(
      [item('a', 'b'), item('b', 'a')],
      { idOf: value => value.id, parentIdOf: value => value.parentId },
    )
    assert.ok(roots.length >= 1)
    assert.ok(roots.length <= 2)
  })
})
