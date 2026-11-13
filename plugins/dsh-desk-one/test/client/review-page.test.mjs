// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pageText, sameReviewPage } from '../../lib/client/notebook/review-page.js'

/** Minimal page fixture; overrides keep each case readable. */
const page = (overrides = {}) => ({
  path: 'Diary/a.md',
  title: 'A',
  kind: /** @type {'markdown' | 'text'} */ ('markdown'),
  fields: [],
  frontmatter: '',
  body: 'hello\n',
  bytes: 6,
  ...overrides,
})

describe('审阅页面比较', () => {
  it('markdown 页面的源码文本包含 frontmatter', () => {
    const value = page({ frontmatter: '---\ntitle: A\n---\n' })
    assert.equal(pageText(value), '---\ntitle: A\n---\nhello\n')
  })

  it('text 页面只有正文', () => {
    assert.equal(pageText(page({ kind: 'text', frontmatter: 'ignored' })), 'hello\n')
  })

  it('仅 frontmatter 变化 应该 判定为不同（此前会漏掉）', () => {
    const before = page({ frontmatter: '---\ntitle: A\n---\n' })
    const after = page({ frontmatter: '---\ntitle: B\n---\n' })
    assert.equal(sameReviewPage(before, after), false)
    assert.notEqual(pageText(after), pageText(before))
  })

  it('仅标题或字段变化 应该 判定为不同', () => {
    const base = page()
    assert.equal(sameReviewPage(base, page({ title: 'B' })), false)
    assert.equal(sameReviewPage(base, page({ fields: [{ name: 'date', value: '2026-11-14' }] })), false)
  })

  it('字段内容与顺序相同 应该 判定为相同', () => {
    const fields = [{ name: 'title', value: 'A' }, { name: 'tags', value: 'x' }]
    assert.equal(sameReviewPage(page({ fields }), page({ fields: [...fields] })), true)
  })

  it('正文变化 应该 判定为不同', () => {
    assert.equal(sameReviewPage(page(), page({ body: 'hello\nworld\n' })), false)
  })

  it('路径或 kind 不同 应该 判定为不同', () => {
    assert.equal(sameReviewPage(page(), page({ path: 'Diary/b.md' })), false)
    assert.equal(sameReviewPage(page(), page({ kind: 'text' })), false)
  })
})
