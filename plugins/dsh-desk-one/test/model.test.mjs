// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DeskModelError, createNoteRecord, filterNotes, normalizeNoteInput, patchNoteRecord, sortNotes,
} from '../lib/model.js'

/** 造一条合法便签记录（时间可覆盖，便于排序断言）。 */
const note = (over = {}) => ({
  id: 'note_1',
  kind: 'note',
  schema: 1,
  title: '标题',
  body: '正文',
  tags: [],
  color: 'default',
  pinned: false,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
  ...over,
})

describe('desk 对象模型：入参归一化', () => {
  it('标题为空时 应该 从正文首行补标题', () => {
    const input = normalizeNoteInput({ body: '  第一行\n第二行' })
    assert.equal(input.title, '第一行')
    assert.equal(input.body, '  第一行\n第二行')
    assert.equal(input.color, 'default')
  })

  it('标题与正文都为空 应该 拒绝（INVALID_NOTE）', () => {
    assert.throws(() => normalizeNoteInput({ title: '  ', body: ' ' }), (error) => {
      assert.ok(error instanceof DeskModelError)
      assert.equal(error.code, 'INVALID_NOTE')
      return true
    })
  })

  it('未知颜色 应该 拒绝', () => {
    assert.throws(() => normalizeNoteInput({ body: 'x', color: 'purple' }), /未知的便签颜色/u)
  })

  it('超长正文 应该 拒绝', () => {
    assert.throws(() => normalizeNoteInput({ body: 'x'.repeat(20_001) }), /正文超过/u)
  })

  it('超长标题 应该 拒绝', () => {
    assert.throws(() => normalizeNoteInput({ title: 'x'.repeat(201) }), /标题超过/u)
  })
})

describe('desk 对象模型：创建与补丁', () => {
  it('创建 应该 生成完整对象（revision 1 / 未置顶 / 未归档）', () => {
    const record = createNoteRecord(
      { title: 'a', body: 'b', color: 'yellow' },
      { id: 'note_x', now: '2026-01-01T00:00:00.000Z' },
    )
    assert.deepEqual(record, {
      id: 'note_x',
      kind: 'note',
      schema: 1,
      title: 'a',
      body: 'b',
      tags: [],
      color: 'yellow',
      pinned: false,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 1,
    })
  })

  it('补丁 应该 递增 revision 并合并字段', () => {
    const next = patchNoteRecord(note(), { title: '  新标题 ', pinned: true }, {
      expectedRevision: 1,
      now: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(next.title, '新标题')
    assert.equal(next.pinned, true)
    assert.equal(next.revision, 2)
    assert.equal(next.updatedAt, '2026-01-02T00:00:00.000Z')
    assert.equal(next.body, '正文')
  })

  it('revision 不匹配 应该 抛 REVISION_CONFLICT（乐观并发）', () => {
    assert.throws(
      () => patchNoteRecord(note({ revision: 3 }), { body: 'x' }, { expectedRevision: 2, now: 'now' }),
      (error) => error instanceof DeskModelError && error.code === 'REVISION_CONFLICT',
    )
  })

  it('补丁把标题清空 应该 拒绝', () => {
    assert.throws(
      () => patchNoteRecord(note(), { title: '   ' }, { expectedRevision: 1, now: 'now' }),
      /标题不能为空/u,
    )
  })

  it('补丁的 pinned 非布尔 应该 拒绝', () => {
    assert.throws(
      () => patchNoteRecord(note(), /** @type {any} */ ({ pinned: 'yes' }), { expectedRevision: 1, now: 'now' }),
      /pinned 必须是布尔值/u,
    )
  })
})

describe('desk 对象模型：排序与过滤', () => {
  it('排序 应该 置顶优先、其余按更新时间倒序', () => {
    const sorted = sortNotes([
      note({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
      note({ id: 'b', updatedAt: '2026-01-03T00:00:00.000Z' }),
      note({ id: 'c', updatedAt: '2026-01-02T00:00:00.000Z', pinned: true }),
    ])
    assert.deepEqual(sorted.map(item => item.id), ['c', 'b', 'a'])
  })

  it('过滤 应该 大小写不敏感匹配标题与正文', () => {
    const notes = [
      note({ id: 'a', title: '会议纪要', body: '周会' }),
      note({ id: 'b', title: 'Shopping', body: 'milk' }),
    ]
    assert.deepEqual(filterNotes(notes, '周会').map(item => item.id), ['a'])
    assert.deepEqual(filterNotes(notes, 'SHOP').map(item => item.id), ['b'])
    assert.equal(filterNotes(notes, '   ').length, 2)
  })
})
