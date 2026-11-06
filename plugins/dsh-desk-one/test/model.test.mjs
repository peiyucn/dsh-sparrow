// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DeskModelError, createNoteRecord, filterNotes, normalizeNoteInput, patchNoteRecord, sortNotes,
} from '../lib/model.js'
import { NOTE_MAX_SIZE, NOTE_MIN_WIDTH } from '../lib/constants.js'

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
  trashed: false,
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

  it('标题与正文都为空 应该 允许（便签墙先「+」再打字）', () => {
    const input = normalizeNoteInput({})
    assert.equal(input.title, '')
    assert.equal(input.body, '')
    assert.equal(input.color, 'default')
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
      trashed: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 1,
    })
  })

  it('创建 应该 接受初始层级（新建便签默认置顶）', () => {
    const record = createNoteRecord(
      { title: 'a', body: 'b', color: 'default' },
      { id: 'note_x', now: '2026-01-01T00:00:00.000Z', z: 42 },
    )
    assert.equal(record.z, 42)
    const invalid = createNoteRecord(
      { title: 'a', body: 'b', color: 'default' },
      { id: 'note_x', now: '2026-01-01T00:00:00.000Z', z: -1 },
    )
    assert.equal(invalid.z, undefined)
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

  it('补丁改正文 应该 让 title 跟随正文首行（便签墙只展示正文）', () => {
    const next = patchNoteRecord(note({ title: '', body: '' }), { body: '第一行\n第二行' }, {
      expectedRevision: 1,
      now: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(next.body, '第一行\n第二行')
    assert.equal(next.title, '第一行')
  })

  it('补丁可以保存便签墙坐标（取整，非法值忽略）', () => {
    const next = patchNoteRecord(note(), { x: 120.6, y: -5 }, {
      expectedRevision: 1,
      now: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(next.x, 121)
    assert.equal(next.y, undefined, '负数坐标按非法值忽略')
  })

  it('补丁可以保存贴纸层级（取整，非法忽略）', () => {
    const next = patchNoteRecord(note(), { z: 12.6 }, {
      expectedRevision: 1,
      now: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(next.z, 13)

    const ignored = patchNoteRecord(note(), { z: -1 }, {
      expectedRevision: 1,
      now: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(ignored.z, undefined)
  })

  it('补丁可以保存便签尺寸（夹到上下限，非法值忽略）', () => {
    const next = patchNoteRecord(note(), { width: 10, height: 99_999 }, {
      expectedRevision: 1,
      now: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(next.width, NOTE_MIN_WIDTH, '过小的宽度夹到下限')
    assert.equal(next.height, NOTE_MAX_SIZE, '过大的高度夹到上限')

    const ignored = patchNoteRecord(note(), { width: -5, height: Number.NaN }, {
      expectedRevision: 1,
      now: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(ignored.width, undefined)
    assert.equal(ignored.height, undefined)
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
