// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DeskModelError } from '../../../lib/model/errors.js'
import {
  anchorStillValid, appendAnnotationComment, assertAnnotationDeletable, createAnnotationRecord, normalizeAnnotationAnchor,
  patchAnnotationStatus, reanchorAnnotation,
} from '../../../lib/host/notebook/annotations.js'
import { normalizeLibraryPath } from '../../../lib/host/notebook/library.js'

/** Build one record the same way the store does. */
function record(overrides = {}) {
  return createAnnotationRecord(
    { path: 'notes/a.md', anchor: { type: 'quote', quote: '结论' }, body: '这里不准确', ...overrides },
    { id: 'annotation_1', now: '2026-11-11T00:00:00.000Z', schema: 1 },
  )
}

describe('annotation: path', () => {
  it('接受相对路径并归一化反斜杠', () => {
    assert.equal(normalizeLibraryPath('notes/a.md'), 'notes/a.md')
    assert.equal(normalizeLibraryPath('notes\\sub\\a.md'), 'notes/sub/a.md')
  })

  it('拒绝绝对路径与上级目录', () => {
    for (const bad of ['/abs/a.md', 'C:\\notes\\a.md', '../a.md', 'notes/../a.md', 'notes//a.md', '']) {
      assert.throws(() => normalizeLibraryPath(bad), DeskModelError, `应拒绝 ${JSON.stringify(bad)}`)
    }
  })
})

describe('annotation: anchor', () => {
  it('字段锚保留字段名与原值', () => {
    assert.deepEqual(normalizeAnnotationAnchor({ type: 'field', field: 'title', value: '旧标题' }), {
      type: 'field', field: 'title', value: '旧标题',
    })
  })

  it('引用锚保留引文与上下文，位置取非负整数', () => {
    assert.deepEqual(
      normalizeAnnotationAnchor({ type: 'quote', quote: '结论', prefix: '前文', suffix: '后文', position: 12.9 }),
      { type: 'quote', quote: '结论', prefix: '前文', suffix: '后文', position: 12 },
    )
  })

  it('引用锚省略上下文时不留空字段', () => {
    assert.deepEqual(normalizeAnnotationAnchor({ type: 'quote', quote: '结论', prefix: '', suffix: '' }), {
      type: 'quote', quote: '结论',
    })
  })

  it('拒绝未知类型与空引文/空字段名', () => {
    for (const bad of [
      { type: 'range', quote: 'x' },
      { type: 'quote', quote: '   ' },
      { type: 'field', field: '' },
    ]) {
      assert.throws(() => normalizeAnnotationAnchor(bad), DeskModelError)
    }
  })
})

describe('annotation: record', () => {
  it('新线程是 open、第一条消息来自人、revision 为 1', () => {
    const created = record()
    assert.equal(created.status, 'open')
    assert.equal(created.revision, 1)
    assert.deepEqual(created.comments, [{ author: 'human', body: '这里不准确', at: '2026-11-11T00:00:00.000Z' }])
  })

  it('缺少内容时拒绝创建', () => {
    assert.throws(() => record({ body: '  ' }), DeskModelError)
  })
})

describe('annotation: thread', () => {
  it('追加消息增加 revision 并保留顺序', () => {
    const replied = appendAnnotationComment(record(), { body: '已改好', author: 'ai' }, '2026-11-11T01:00:00.000Z')
    assert.equal(replied.revision, 2)
    assert.deepEqual(replied.comments.map(comment => comment.author), ['human', 'ai'])
  })

  it('达到消息上限后拒绝继续追加', () => {
    let current = record()
    for (let index = 1; index < 50; index += 1) {
      current = appendAnnotationComment(current, { body: `回复 ${index}`, author: 'ai' }, '2026-11-11T01:00:00.000Z')
    }
    assert.throws(() => appendAnnotationComment(current, { body: '再来一条', author: 'ai' }, '2026-11-11T01:00:00.000Z'), DeskModelError)
  })
})

describe('annotation: status machine', () => {
  it('open 可以变成 answered', () => {
    const patched = patchAnnotationStatus(record(), 'answered', '2026-11-11T02:00:00.000Z')
    assert.equal(patched.status, 'answered')
    assert.equal(patched.revision, 2)
  })

  it('resolved 只能从 answered 进入；已接受是终态（由回复重开，不由 status 改）', () => {
    const answered = patchAnnotationStatus(record(), 'answered', '2026-11-11T02:00:00.000Z')
    const resolved = patchAnnotationStatus(answered, 'resolved', '2026-11-11T03:00:00.000Z')
    assert.equal(resolved.status, 'resolved')
    // No pending answer on an open thread, and an accepted thread is not reopened by status.
    assert.throws(() => patchAnnotationStatus(record(), 'resolved', '2026-11-11T03:00:00.000Z'), DeskModelError)
    assert.throws(() => patchAnnotationStatus(resolved, 'open', '2026-11-11T04:00:00.000Z'), DeskModelError)
  })

  it('状态不变时不增加 revision', () => {
    const current = record()
    assert.equal(patchAnnotationStatus(current, 'open', '2026-11-11T02:00:00.000Z'), current)
  })

  it('拒绝非法状态', () => {
    assert.throws(() => patchAnnotationStatus(record(), 'done', '2026-11-11T02:00:00.000Z'), DeskModelError)
  })
})

describe('annotation: delete', () => {
  it('已接受的批注不能删除，其余状态可删', () => {
    for (const status of ['open', 'answered', 'orphaned']) {
      assert.doesNotThrow(() => assertAnnotationDeletable(status), `${status} 应可删除`)
    }
    assert.throws(() => assertAnnotationDeletable('resolved'), DeskModelError)
  })
})

describe('annotation: orphan detection & relocation', () => {
  it('引用锚按原文匹配，字段锚只看字段是否存在（值变不算失效）', () => {
    const body = '正文里包含结论这句话'
    assert.equal(anchorStillValid({ type: 'quote', quote: '结论' }, body, []), true)
    assert.equal(anchorStillValid({ type: 'quote', quote: '已被删掉的句子' }, body, []), false)
    assert.equal(anchorStillValid({ type: 'field', field: 'type', value: 'meeting' }, body, [{ name: 'type', value: 'note' }]), true)
    assert.equal(anchorStillValid({ type: 'field', field: 'type', value: 'meeting' }, body, [{ name: 'date', value: '2026-11-11' }]), false)
  })

  it('重新定位更新锚点、回到 open、revision 只加一', () => {
    const orphaned = { ...record(), status: 'orphaned', revision: 3 }
    const next = reanchorAnnotation(orphaned, { type: 'quote', quote: '新位置' }, '2026-11-11T05:00:00.000Z')
    assert.equal(next.status, 'open')
    assert.equal(next.revision, 4)
    assert.deepEqual(next.anchor, { type: 'quote', quote: '新位置' })
  })

  it('已接受的批注不能重新定位（审阅历史）', () => {
    assert.throws(
      () => reanchorAnnotation({ ...record(), status: 'resolved' }, { type: 'quote', quote: 'x' }, '2026-11-11T05:00:00.000Z'),
      DeskModelError,
    )
  })
})
