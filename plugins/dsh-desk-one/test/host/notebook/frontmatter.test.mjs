// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { displayTitle, parsePage } from '../../../lib/host/notebook/frontmatter.js'

describe('notebook frontmatter', () => {
  it('解析 title / type / date / tags 与正文', () => {
    const raw = ['---', 'title: 示例', 'type: meeting', 'date: 2026-11-12', 'tags: [a, b]', '---', '', '正文', ''].join('\n')
    const page = parsePage(raw, Buffer.byteLength(raw))
    assert.equal(page.hasFrontmatter, true)
    assert.equal(page.title, '示例')
    assert.equal(page.type, 'meeting')
    assert.equal(page.date, '2026-11-12')
    assert.deepEqual(page.tags, ['a', 'b'])
    assert.equal(page.frontmatter, ['---', 'title: 示例', 'type: meeting', 'date: 2026-11-12', 'tags: [a, b]', '---', ''].join('\n'))
    assert.equal(page.body.trim(), '正文')
    assert.equal(displayTitle(page, 'Work/x.md'), '示例')
  })

  it('没有 frontmatter 时整篇为正文，标题回退文件名', () => {
    const raw = '# 标题\n内容'
    const page = parsePage(raw, Buffer.byteLength(raw))
    assert.equal(page.hasFrontmatter, false)
    assert.deepEqual(page.tags, [])
    assert.equal(page.frontmatter, '')
    assert.equal(page.body, raw)
    assert.equal(displayTitle(page, 'Diary/快速笔记/示例二.md'), '示例二')
  })

  it('未闭合的 fence 视为没有 frontmatter', () => {
    const raw = '---\ntitle: x\n没有结束'
    const page = parsePage(raw, Buffer.byteLength(raw))
    assert.equal(page.hasFrontmatter, false)
  })
})
