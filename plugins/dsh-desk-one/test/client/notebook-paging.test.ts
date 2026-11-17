
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOTEBOOK_PAGE_SIZE, pageForRoot, paginate } from '../../lib/client/notebook/paging.js'

describe('notebook 分页', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1)

  it('默认每页 20 条并给出页数', () => {
    assert.equal(NOTEBOOK_PAGE_SIZE, 20)
    const first = paginate(rows, 1)
    assert.deepEqual(first.rows, Array.from({ length: 20 }, (_, index) => index + 1))
    assert.equal(first.page, 1)
    assert.equal(first.pages, 2)
  })

  it('越界页夹到边界，非法页回到第一页', () => {
    const last = paginate(rows, 99)
    assert.equal(last.page, 2)
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

describe('notebook 服务端分页快照按根目录生效', () => {
  const snapshot = ( rootPath) => ({
    rootPath,
    entries: [{ path: 'a.md' }],
    total: 1,
  })

  it('根目录一致时返回快照', () => {
    assert.deepEqual(pageForRoot(snapshot('/notes/a'), '/notes/a'), snapshot('/notes/a'))
  })

  it('切换根目录后旧快照立即失效，不渲染上一个库的行', () => {
    assert.equal(pageForRoot(snapshot('/notes/a'), '/notes/b'), null)
  })

  it('没有链接根目录时（含从已链接切到未链接）不返回任何快照', () => {
    assert.deepEqual(pageForRoot(snapshot(undefined), undefined), snapshot(undefined))
    assert.equal(pageForRoot(snapshot('/notes/a'), undefined), null)
    assert.equal(pageForRoot(null, '/notes/a'), null)
  })
})
