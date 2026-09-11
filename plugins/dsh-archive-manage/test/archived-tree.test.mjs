import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dropArchivedIds, subtreeIdsOf, trashSubagentTree } from '../lib/client/archivedTree.js'

/** 最小归档树节点（真实条目形状见 ArchivedSessionItem；纯逻辑只读 sessionId / orphan / children）。 */
const node = (sessionId, children = [], orphan = false) => ({ sessionId, orphan, children })
/** p → c → gc，p 另有直接子会话 c2；顶层还有 other。 */
const tree = () => [
  node('p', [node('c', [node('gc')]), node('c2')]),
  node('other'),
]
const ids = (...values) => new Set(values)

describe('dropArchivedIds（按 host 传回的 id 集合本地摘行）', () => {
  // host 的 trash/delete 现在传回「根 + 全部后代」，故正常路径整棵子树一次摘净。
  it('摘整棵子树 应该 只留未命中的顶层节点', () => {
    const next = dropArchivedIds(tree(), ids('p', 'c', 'gc', 'c2'))
    assert.deepEqual(next.map(item => item.sessionId), ['other'])
  })

  // 纯函数契约：未命中的后代按现状保留并上提为孤儿根（防御 host 传回的集合不完整）。
  it('只摘根 + 直接子会话 应该 保留深度 ≥2 的后代（上提为孤儿根）', () => {
    const next = dropArchivedIds(tree(), ids('p', 'c'))
    assert.deepEqual(next.map(item => item.sessionId), ['gc', 'c2', 'other'])
    assert.equal(next[0].orphan, true)
    assert.equal(next[1].orphan, true)
  })

  it('未命中的节点 应该 原样留在原位（含其子树）', () => {
    const next = dropArchivedIds(tree(), ids('other'))
    assert.deepEqual(next.map(item => item.sessionId), ['p'])
    assert.deepEqual(next[0].children.map(item => item.sessionId), ['c', 'c2'])
    assert.deepEqual(next[0].children[0].children.map(item => item.sessionId), ['gc'])
  })

  it('只命中中间子会话 应该 摘它、其父与后代都保留', () => {
    const next = dropArchivedIds(tree(), ids('c'))
    assert.deepEqual(next.map(item => item.sessionId), ['p', 'other'])
    assert.deepEqual(next[0].children.map(item => item.sessionId), ['gc', 'c2'])
    assert.equal(next[0].children[0].orphan, true)
    assert.equal(next[0].children[1].orphan, false)
  })

  it('未命中任何 id 应该 结构不变且不新增 orphan 标', () => {
    const next = dropArchivedIds(tree(), ids())
    assert.deepEqual(next.map(item => item.sessionId), ['p', 'other'])
    assert.equal(next[0].orphan, false)
  })
})

describe('subtreeIdsOf（取消归档时即时摘除整棵子树）', () => {
  it('根 + 多层子孙 应该 全部收集且根在前', () => {
    assert.deepEqual(subtreeIdsOf(tree()[0]), ['p', 'c', 'gc', 'c2'])
  })

  it('叶子节点 应该 只有自身', () => {
    assert.deepEqual(subtreeIdsOf(node('leaf')), ['leaf'])
  })
})

describe('trashSubagentTree（spec 14：回收站条目按 sidecar 父子链还原层级）', () => {
  const sub = (sessionId, parentSessionId) => ({ sessionId, title: sessionId, ...parentSessionId === undefined ? {} : { parentSessionId } })
  const shape = nodes => nodes.map(node => ({ id: node.item.sessionId, children: shape(node.children) }))

  it('四层链 应该 逐层嵌套（此前只有一层可画）', () => {
    const tree2 = trashSubagentTree([
      sub('c', 'root'), sub('gc', 'c'), sub('ggc', 'gc'), sub('gggc', 'ggc'),
    ])
    assert.deepEqual(shape(tree2), [{ id: 'c', children: [{ id: 'gc', children: [{ id: 'ggc', children: [{ id: 'gggc', children: [] }] }] }] }])
  })

  it('姊妹会话 应该 挂同一父下且保持清单顺序', () => {
    const tree2 = trashSubagentTree([sub('a', 'root'), sub('b', 'root'), sub('a1', 'a'), sub('a2', 'a')])
    assert.deepEqual(shape(tree2), [{
      id: 'a',
      children: [{ id: 'a1', children: [] }, { id: 'a2', children: [] }],
    }, { id: 'b', children: [] }])
  })

  // 旧 sidecar（本版之前落的盘）没有 parentSessionId：全部按顶层平铺，不丢任何一行。
  it('旧 sidecar（无 parentSessionId）应该 全部按顶层平铺', () => {
    const tree2 = trashSubagentTree([sub('c'), sub('gc'), sub('other')])
    assert.deepEqual(shape(tree2), [{ id: 'c', children: [] }, { id: 'gc', children: [] }, { id: 'other', children: [] }])
  })

  it('父不在本条目内 应该 按顶层挂（不丢行）', () => {
    const tree2 = trashSubagentTree([sub('orphan', 'gone'), sub('kid', 'orphan')])
    assert.deepEqual(shape(tree2), [{ id: 'orphan', children: [{ id: 'kid', children: [] }] }])
  })

  it('重复 id 应该 只收一次', () => {
    const tree2 = trashSubagentTree([sub('c', 'root'), sub('c', 'root')])
    assert.deepEqual(shape(tree2), [{ id: 'c', children: [] }])
  })

  it('父子成环（畸形数据）应该 按顶层挂且终止（不丢行、不转死）', () => {
    const tree2 = trashSubagentTree([sub('a', 'b'), sub('b', 'a')])
    assert.deepEqual(shape(tree2), [{ id: 'a', children: [] }, { id: 'b', children: [] }])
  })

  it('空清单 应该 返回空数组', () => {
    assert.deepEqual(trashSubagentTree([]), [])
  })
})
