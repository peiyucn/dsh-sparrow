// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DeskModelError } from '../../../lib/model/errors.js'
import {
  anchorStillValid, appendAnnotationComment, assertAnnotationDeletable, autoRelocateAnchor, createAnnotationRecord,
  mayBecomeOrphan, normalizeAnnotationAnchor, patchAnnotationStatus,
} from '../../../lib/host/notebook/annotations.js'
import { normalizeLibraryPath } from '../../../lib/host/notebook/library.js'
import { NOTEBOOK_BASELINE_MAX_CHARS } from '../../../lib/constants.js'

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

describe('annotation: orphan detection & automatic relocation', () => {
  it('引用锚按原文匹配，字段锚只看字段是否存在（值变不算失效）', () => {
    const body = '正文里包含结论这句话'
    assert.equal(anchorStillValid({ type: 'quote', quote: '结论' }, body, []), true)
    assert.equal(anchorStillValid({ type: 'quote', quote: '已被删掉的句子' }, body, []), false)
    assert.equal(anchorStillValid({ type: 'field', field: 'type', value: 'meeting' }, body, [{ name: 'type', value: 'note' }]), true)
    assert.equal(anchorStillValid({ type: 'field', field: 'type', value: 'meeting' }, body, [{ name: 'date', value: '2026-11-11' }]), false)
  })

  it('自动定位：忽略空白差异重新匹配', () => {
    const relocated = autoRelocateAnchor(
      { type: 'quote', quote: '多session协作' },
      '前言\n多 session 协作，对抗\n后记',
      [],
    )
    assert.ok(relocated && relocated.type === 'quote')
    assert.match(relocated.quote, /多 session 协作/u)
  })

  it('自动定位：靠前后文找回被改写的段落', () => {
    const relocated = autoRelocateAnchor(
      { type: 'quote', quote: '旧的措辞', prefix: 'AAAAAAA--', suffix: '--CCCCCCC' },
      '前缀AAAAAAA--完全重写后的新句子--CCCCCCC后缀',
      [],
    )
    assert.ok(relocated && relocated.type === 'quote')
    assert.equal(relocated.quote, '完全重写后的新句子')
    assert.equal(relocated.position, '前缀AAAAAAA--'.length)
  })

  it('前后文不唯一时放弃（宁失效不错位）', () => {
    assert.equal(autoRelocateAnchor(
      { type: 'quote', quote: '旧的', prefix: 'AAAAAAA--', suffix: '--CCCCCCC' },
      'AAAAAAA--one--CCCCCCC 与 AAAAAAA--two--CCCCCCC',
      [],
    ), undefined)
  })

  it('字段锚能定位当且仅当字段仍存在', () => {
    const field = { type: 'field', field: 'type', value: 'meeting' }
    assert.deepEqual(autoRelocateAnchor(field, '', [{ name: 'type', value: 'note' }]), field)
    assert.equal(autoRelocateAnchor(field, '', [{ name: 'date', value: 'x' }]), undefined)
  })
})

describe('annotation: review baseline', () => {
  it('创建时快照正文作为 diff 基线，超长截到上限', () => {
    const kept = createAnnotationRecord(
      { path: 'a.md', anchor: { type: 'quote', quote: '结论' }, body: '意见' },
      { id: 'a1', now: '2026-11-11T00:00:00.000Z', schema: 1, baselineText: '旧正文' },
    )
    assert.equal(kept.baseline?.text, '旧正文')
    const capped = createAnnotationRecord(
      { path: 'a.md', anchor: { type: 'quote', quote: '结论' }, body: '意见' },
      { id: 'a2', now: '2026-11-11T00:00:00.000Z', schema: 1, baselineText: 'x'.repeat(NOTEBOOK_BASELINE_MAX_CHARS + 10) },
    )
    assert.equal(capped.baseline?.text.length, NOTEBOOK_BASELINE_MAX_CHARS)
  })
})

describe('annotation: orphan eligibility', () => {
  it('只有「未处理且 AI 从未参与」的线程会因锚点失效而变 orphaned', () => {
    assert.equal(mayBecomeOrphan('open', false), true)
    // AI 回复后改掉原文是正常闭环，不能判失效。
    assert.equal(mayBecomeOrphan('open', true), false)
    assert.equal(mayBecomeOrphan('answered', false), false)
    assert.equal(mayBecomeOrphan('answered', true), false)
    assert.equal(mayBecomeOrphan('resolved', true), false)
  })
})
