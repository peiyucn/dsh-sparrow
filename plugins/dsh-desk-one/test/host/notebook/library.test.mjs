// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeRelativePath } from '../../../lib/host/notebook/library.js'
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
})
