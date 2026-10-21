// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isContentChurn, isContentChurnByRecords } from '../lib/mutation-gate.js'

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

/**
 * 流式版（短路）。
 * ⚠️ 与 `isContentChurn` **必须语义等价** —— 这里就是拿同一批输入对拍，
 * 免得「为了省几次 closest 而悄悄改了判定」。
 */
describe('mutation-gate：流式版（短路）与批量版语义等价', () => {
  const cases = [
    [],
    [{ insideContent: true, anchorLike: false }],
    [{ insideContent: true, anchorLike: false }, { insideContent: true, anchorLike: false }],
    [{ insideContent: false, anchorLike: false }],
    [{ insideContent: true, anchorLike: true }],
    [{ insideContent: true, anchorLike: false }, { insideContent: false, anchorLike: false }],
    [{ insideContent: true, anchorLike: false }, { insideContent: true, anchorLike: true }],
    [{ insideContent: false, anchorLike: false }, { insideContent: true, anchorLike: false }],
  ]

  for (const [index, signals] of cases.entries()) {
    it(`用例 ${index}：两版结论一致`, () => {
      assert.equal(isContentChurnByRecords(signals), isContentChurn(signals))
    })
  }

  it('一发现反例就停：后续元素**不再被消费**（惰性输入证明短路生效）', () => {
    let consumed = 0
    const records = (function* () {
      consumed += 1
      yield { insideContent: true, anchorLike: false }
      consumed += 1
      yield { insideContent: false, anchorLike: false } // ← 反例，到这里就该返回
      consumed += 1
      yield { insideContent: true, anchorLike: false }
    })()
    assert.equal(isContentChurnByRecords(records), false)
    assert.equal(consumed, 2, '反例之后的那条不该被消费')
  })

  it('全为内容变动时会把整批吃完（不能提前返回 true）', () => {
    let consumed = 0
    const records = (function* () {
      for (let i = 0; i < 5; i++) {
        consumed += 1
        yield { insideContent: true, anchorLike: false }
      }
    })()
    assert.equal(isContentChurnByRecords(records), true)
    assert.equal(consumed, 5)
  })
})
