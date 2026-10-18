import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isContentChurn } from '../lib/mutation-gate.js'

describe('mutation-gate：流式内容变动判定', () => {
  it('全部落在对话滚动容器内、且不含锚点相关节点 → 判为内容流式变动（应推迟探测）', () => {
    assert.equal(isContentChurn([
      { insideContent: true, anchorLike: false },
      { insideContent: true, anchorLike: false },
    ]), true)
  })

  it('任一变动落在内容区外（菜单 / 弹层 / 右栏 / 布局）→ 必须立即处理', () => {
    assert.equal(isContentChurn([
      { insideContent: true, anchorLike: false },
      { insideContent: false, anchorLike: false },
    ]), false)
  })

  it('内容区里出现锚点相关节点（新轮次导航等）→ 必须立即处理', () => {
    assert.equal(isContentChurn([
      { insideContent: true, anchorLike: true },
    ]), false)
  })

  it('空批次不算内容变动（避免空转）', () => {
    assert.equal(isContentChurn([]), false)
  })
})
