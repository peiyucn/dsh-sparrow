import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FILE_PAGE_SIZE, hasLoadMore, renderedRowCount, RENDER_PAGE_SIZE } from '../lib/client/paging.js'

describe('dsh-file-manage 渲染窗口纯逻辑', () => {
  it('常量 应该 数据页大于渲染窗口（窗口才真正裁剪 DOM）', () => {
    assert.equal(RENDER_PAGE_SIZE, 100)
    assert.equal(FILE_PAGE_SIZE, 200)
    assert.ok(FILE_PAGE_SIZE > RENDER_PAGE_SIZE)
  })

  it('renderedRowCount 应该 返回已加载行数与窗口上限的较小值', () => {
    assert.equal(renderedRowCount(200, 100), 100)
    assert.equal(renderedRowCount(60, 100), 60)
    assert.equal(renderedRowCount(100, 100), 100)
    assert.equal(renderedRowCount(0, 100), 0)
  })

  it('renderedRowCount 应该 把负数/小数钳到安全值（不抛）', () => {
    assert.equal(renderedRowCount(-5, 100), 0)
    assert.equal(renderedRowCount(50, -1), 0)
    assert.equal(renderedRowCount(50.7, 100), 50)
  })

  it('hasLoadMore 应该 窗口未盖满已加载行时为真（纯延伸窗口，无需服务端更多数据）', () => {
    assert.equal(hasLoadMore(200, 100, false), true)
  })

  it('hasLoadMore 应该 窗口盖满但服务端还有更多时为真（延伸窗口 + 拉页）', () => {
    assert.equal(hasLoadMore(100, 100, true), true)
  })

  it('hasLoadMore 应该 窗口盖满且无更多数据时为假', () => {
    assert.equal(hasLoadMore(100, 100, false), false)
    assert.equal(hasLoadMore(0, 100, false), false)
  })
})
