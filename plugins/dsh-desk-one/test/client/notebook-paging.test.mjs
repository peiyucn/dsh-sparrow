// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOTEBOOK_PAGE_SIZE, paginate } from '../../lib/client/notebook/paging.js'

describe('notebook 分页', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1)

  it('默认每页 10 条并给出页数', () => {
    assert.equal(NOTEBOOK_PAGE_SIZE, 10)
    const first = paginate(rows, 1)
    assert.deepEqual(first.rows, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.equal(first.page, 1)
    assert.equal(first.pages, 3)
  })

  it('越界页夹到边界，非法页回到第一页', () => {
    const last = paginate(rows, 99)
    assert.equal(last.page, 3)
    assert.deepEqual(last.rows, [21, 22, 23])
    assert.equal(paginate(rows, 0).page, 1)
    assert.equal(paginate(rows, -3).page, 1)
    assert.equal(paginate(rows, Number.NaN).page, 1)
  })

  it('空列表仍然算一页', () => {
    const empty = paginate([], 5)
    assert.deepEqual(empty.rows, [])
    assert.equal(empty.page, 1)
    assert.equal(empty.pages, 1)
  })

  it('支持自定义页大小', () => {
    const page = paginate(rows, 2, 5)
    assert.equal(page.rows.length, 5)
    assert.equal(page.pages, 5)
    assert.deepEqual(page.rows, [6, 7, 8, 9, 10])
  })
})
