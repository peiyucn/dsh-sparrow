// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countVisibleRows, trashVisibleRows } from '../lib/client/window.js'

describe('countVisibleRows', () => {
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

describe('trashVisibleRows（回收站分页预算）', () => {
  /** 可还原条目：subagents 扁平清单（层级字段只影响渲染缩进，不影响预算公式）。 */
  const item = (trashId, subagents) => ({ trashId, sessionId: trashId, title: trashId, archivedAt: '', workspaceIds: [], legacy: false, subagents })
  /** 旧格式条目：没有 sidecar，也就没有可展开的子会话。 */
  const legacyItem = (trashId) => ({ trashId, sessionId: trashId, title: trashId, archivedAt: '', workspaceIds: [], legacy: true })

  it('全部折叠时只计父条目', () => {
    const items = [item('a', [{ sessionId: 'c1', title: 'c1' }]), legacyItem('b')]
    assert.equal(trashVisibleRows(items, () => true), 2)
  })

  it('展开时计父条目 + 直接子会话', () => {
    const items = [item('a', [{ sessionId: 'c1', title: 'c1' }, { sessionId: 'c2', title: 'c2' }])]
    assert.equal(trashVisibleRows(items, () => false), 3)
  })

  it('旧格式条目按 0 个子会话计（不读不存在的 subagents）', () => {
    assert.equal(trashVisibleRows([legacyItem('b')], () => false), 1)
  })

  /**
   * 复核（本轮）：sidecar v2 的 subagents 是**全部后代**的扁平清单，不是「直接子会话」；
   * 渲染树每个唯一条目一行 ⇒ 父 + 全部条目 = 渲染行数，深度 ≥2 不会少算。
   * 保持既有公式（分页数字不变）；spec 里「深度 ≥2 少算」的记载待独立任务复核。
   */
  it('深度 ≥2 的后代也计入（sidecar 记全部后代，与渲染行数一致）', () => {
    const items = [item('a', [
      { sessionId: 'c', title: 'c', parentSessionId: 'a' },
      { sessionId: 'gc', title: 'gc', parentSessionId: 'c' },
      { sessionId: 'ggc', title: 'ggc', parentSessionId: 'gc' },
    ])]
    assert.equal(trashVisibleRows(items, () => false), 4)
  })
})
