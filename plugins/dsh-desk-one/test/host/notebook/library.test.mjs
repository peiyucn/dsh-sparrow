// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeRelativePath, searchEntries, summarize } from '../../../lib/host/notebook/library.js'
import { isIndexedPath, sortEntries } from '../../../lib/host/notebook/scan.js'

/**
 * @param {Partial<{ path: string, title: string, tags: string[], hasFrontmatter: boolean, emptyBody: boolean, bytes: number, mtime: string, type: string }>} overrides
 * @returns {any}
 */
function entry(overrides) {
  return {
    path: 'Diary/a.md', title: 'A', tags: [], hasFrontmatter: true, emptyBody: false, bytes: 10,
    mtime: '2026-11-12T00:00:00.000Z', ...overrides,
  }
}

describe('notebook library', () => {
  it('拒绝绝对路径与跳出笔记库的路径', () => {
    assert.equal(normalizeRelativePath('Diary/a.md'), 'Diary/a.md')
    assert.equal(normalizeRelativePath('Diary\\a.md'), 'Diary/a.md')
    assert.throws(() => normalizeRelativePath('../outside.md'))
    assert.throws(() => normalizeRelativePath('C:/x.md'))
    assert.throws(() => normalizeRelativePath(''))
  })

  it('索引只收 markdown / 纯文本；按修改时间倒序', () => {
    assert.equal(isIndexedPath('a.md'), true)
    assert.equal(isIndexedPath('a.txt'), true)
    assert.equal(isIndexedPath('a.png'), false)
    assert.equal(isIndexedPath('Makefile'), false)
    const sorted = sortEntries([
      entry({ path: 'b.md', mtime: '2026-11-12T00:00:00.000Z' }),
      entry({ path: 'a.md', mtime: '2026-11-13T00:00:00.000Z' }),
    ])
    assert.deepEqual(sorted.map(item => item.path), ['a.md', 'b.md'])
  })

  it('统计与筛选：文本、类型/标签、缺元数据、空笔记', () => {
    const entries = [
      entry({ path: 'a.md', title: '会议记录', tags: ['work'], type: 'meeting' }),
      entry({ path: 'b.md', title: '想法', hasFrontmatter: false }),
      entry({ path: 'c.md', title: '空页', emptyBody: true }),
    ]
    assert.deepEqual(summarize(entries), { total: 3, missingFrontmatter: 1, emptyBody: 1 })
    assert.deepEqual(searchEntries(entries, '会议', {}, 10).entries.map(item => item.path), ['a.md'])
    assert.deepEqual(searchEntries(entries, '', { tag: 'work' }, 10).entries.map(item => item.path), ['a.md'])
    assert.deepEqual(searchEntries(entries, '', { missingFrontmatter: true }, 10).entries.map(item => item.path), ['b.md'])
    assert.deepEqual(searchEntries(entries, '', { emptyBody: true }, 10).entries.map(item => item.path), ['c.md'])
    assert.equal(searchEntries(entries, '', {}, 1).truncated, true)
  })
})
