// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  annotationsByLine, annotationMessage, quoteBlock, selectedRangeOf,
} from '../../lib/client/notebook/review/format.js'

/** Minimal annotation fixture. */
const annotation = (overrides = {}) => ({
  id: 'a1',
  quote: 'line one\nline two',
  text: 'please tighten this',
  startLine: 2,
  endLine: 3,
  createdAt: '2026-11-14T00:00:00.000Z',
  ...overrides,
})

describe('审阅批注格式化（纯函数）', () => {
  it('quoteBlock 每行加引用前缀', () => {
    assert.equal(quoteBlock('a\nb'), '> a\n> b')
    assert.equal(quoteBlock(''), '> ')
  })

  it('选区范围：composer 优先，否则用 live selection', () => {
    assert.deepEqual(selectedRangeOf({ scope: 'selection', startLine: 4, endLine: 6 }, { startLine: 1, endLine: 2 }), { start: 4, end: 6 })
    assert.deepEqual(selectedRangeOf({ scope: 'selection', startLine: 4 }, null), { start: 4, end: 4 })
    assert.deepEqual(selectedRangeOf(null, { startLine: 1, endLine: 2 }), { start: 1, end: 2 })
    assert.equal(selectedRangeOf({ scope: 'document' }, null), undefined)
    assert.equal(selectedRangeOf(null, null), undefined)
  })

  it('annotationsByLine 展开覆盖的每一行，整篇批注不参与', () => {
    const byLine = annotationsByLine([
      annotation(),
      annotation({ id: 'doc', scope: 'document', startLine: undefined, endLine: undefined }),
    ])
    assert.deepEqual([...byLine.keys()], [2, 3])
    assert.deepEqual(byLine.get(2)?.map(item => item.id), ['a1'])
    assert.deepEqual(byLine.get(3)?.map(item => item.id), ['a1'])
  })

  it('提交批次格式与 spec 07 一致：编号 / 文件 / 精确行号 / 引用 / 意见', () => {
    const text = annotationMessage('Diary/x.md', [annotation(), annotation({ id: 'a2', startLine: 9, endLine: 9 })])
    assert.equal(text, [
      '【批注 1】文件：Diary/x.md',
      '行号：2-3',
      '> line one',
      '> line two',
      '意见：please tighten this',
      '',
      '【批注 2】文件：Diary/x.md',
      '行号：9',
      '> line one',
      '> line two',
      '意见：please tighten this',
    ].join('\n'))
  })

  it('整篇批注用标题作范围，不带行号', () => {
    const text = annotationMessage('Diary/x.md', [annotation({ scope: 'document', startLine: undefined, endLine: undefined })])
    assert.equal(text, '【批注 1】文件：Diary/x.md\n范围：整篇笔记\n> line one\n> line two\n意见：please tighten this')
  })

  it('空批次返回空串', () => {
    assert.equal(annotationMessage('Diary/x.md', []), '')
  })
})
