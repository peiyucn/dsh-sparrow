// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPathWithin, normalizeNotebookPath, searchPages, summarizePages } from '../../../lib/host/notebook/library.js'

/** Build one scanned page fixture. */
function page(overrides) {
  return {
    body: overrides.body ?? '',
    entry: {
      path: overrides.path,
      title: overrides.title ?? overrides.path,
      ...overrides.type === undefined ? {} : { type: overrides.type },
      tags: overrides.tags ?? [],
      mtimeMs: overrides.mtimeMs ?? 0,
      bytes: 100,
      hasFrontmatter: overrides.hasFrontmatter ?? true,
      bodyChars: overrides.bodyChars ?? (overrides.body === undefined ? 10 : overrides.body.trim().length),
    },
  }
}

describe('notebook library: path containment', () => {
  it('相同路径与子路径算在工作区内', () => {
    assert.equal(isPathWithin('/ws', '/ws'), true)
    assert.equal(isPathWithin('/ws/notes/a.md', '/ws'), true)
    assert.equal(isPathWithin('/ws/notes', '/ws/notes'), true)
  })

  it('前缀相同但不是子目录时不算', () => {
    assert.equal(isPathWithin('/ws-other/a.md', '/ws'), false)
    assert.equal(isPathWithin('/ws2', '/ws'), false)
  })

  it('归一化去掉尾部分隔符与反斜杠', () => {
    assert.equal(normalizeNotebookPath('/ws/notes/'), '/ws/notes')
    assert.equal(normalizeNotebookPath('/ws/notes'), '/ws/notes')
  })
})

describe('notebook library: stats', () => {
  it('统计缺 frontmatter 与空正文，并只带最新 N 条', () => {
    const pages = [
      page({ path: 'a.md', mtimeMs: 3, hasFrontmatter: false }),
      page({ path: 'b.md', mtimeMs: 2, bodyChars: 0 }),
      page({ path: 'c.md', mtimeMs: 1 }),
    ]
    const summary = summarizePages(pages, false, Date.parse('2026-11-11T00:00:00.000Z'))
    assert.deepEqual(summary.stats, { total: 3, missingFrontmatter: 1, emptyBody: 1 })
    assert.deepEqual(summary.recent.map(entry => entry.path), ['a.md', 'b.md', 'c.md'])
    assert.equal(summary.scannedAt, '2026-11-11T00:00:00.000Z')
    assert.equal(summary.truncated, false)
  })
})

describe('notebook library: search', () => {
  const pages = [
    page({ path: 'ai/cake.md', title: 'AI五层蛋糕', body: '模型 产品 工程', tags: ['ai'], type: 'note' }),
    page({ path: 'work/meeting.md', title: '周会', body: '讨论排期', tags: ['work'], type: 'meeting' }),
  ]

  it('按标题 / 路径 / 正文命中', () => {
    assert.deepEqual(searchPages(pages, { query: '蛋糕' }).entries.map(entry => entry.path), ['ai/cake.md'])
    assert.deepEqual(searchPages(pages, { query: 'work/' }).entries.map(entry => entry.path), ['work/meeting.md'])
    assert.deepEqual(searchPages(pages, { query: '排期' }).entries.map(entry => entry.path), ['work/meeting.md'])
  })

  it('type 与 tag 是精确过滤', () => {
    assert.deepEqual(searchPages(pages, { type: 'meeting' }).entries.map(entry => entry.path), ['work/meeting.md'])
    assert.deepEqual(searchPages(pages, { tag: 'ai' }).entries.map(entry => entry.path), ['ai/cake.md'])
    assert.deepEqual(searchPages(pages, { tag: '无此标签' }).entries, [])
  })

  it('limit 截断并标记 truncated', () => {
    const result = searchPages(pages, { limit: 1 })
    assert.equal(result.entries.length, 1)
    assert.equal(result.truncated, true)
  })
})
