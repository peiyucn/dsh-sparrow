// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseFrontmatter, splitFrontmatter } from '../../../lib/host/notebook/frontmatter.js'

describe('frontmatter: split', () => {
  it('没有 frontmatter 时返回 undefined（开头的分隔线不算）', () => {
    assert.equal(splitFrontmatter('# 标题\n正文'), undefined)
    assert.equal(splitFrontmatter('---\ntitle: x\n没有结束'), undefined)
  })

  it('切出块与正文，并给出块的字节数', () => {
    const split = splitFrontmatter('---\ntitle: x\n---\n正文\n')
    assert.ok(split)
    assert.equal(split.block, 'title: x')
    assert.equal(split.body, '正文\n')
    assert.equal(split.bytes, Buffer.byteLength('---\ntitle: x\n---\n'))
  })

  it('支持 BOM 与 ... 结束符', () => {
    const split = splitFrontmatter('\uFEFF---\ntitle: x\n...\n正文')
    assert.ok(split)
    assert.equal(split.body, '正文')
  })
})

describe('frontmatter: parse', () => {
  it('取出 title / type / date / tags 与正文', () => {
    const parsed = parseFrontmatter('---\ntitle: 会议记录\ntype: meeting\ndate: 2026-03-03\ntags:\n  - work\n  - ai\n---\n正文内容', 200)
    assert.equal(parsed.title, '会议记录')
    assert.equal(parsed.type, 'meeting')
    assert.equal(parsed.date, '2026-03-03')
    assert.deepEqual(parsed.tags, ['work', 'ai'])
    assert.equal(parsed.body, '正文内容')
    assert.ok(parsed.bytes > 0)
    assert.equal(parsed.truncated, false)
  })

  it('tags 支持逗号分隔的单值写法', () => {
    const parsed = parseFrontmatter('---\ntags: work, ai\n---\n', 10)
    assert.deepEqual(parsed.tags, ['work', 'ai'])
  })

  it('带冒号的引号值不被截断', () => {
    const parsed = parseFrontmatter('---\ntitle: "框架: 五层"\n---\n', 10)
    assert.equal(parsed.title, '框架: 五层')
  })

  it('非法 YAML 仍算「有 frontmatter」，但不给字段', () => {
    const parsed = parseFrontmatter('---\ntitle: [未闭合\n---\n正文', 30)
    assert.ok(parsed.bytes > 0)
    assert.equal(parsed.title, undefined)
    assert.equal(parsed.body, '正文')
  })

  it('非标量字段被忽略，非字符串标量转成字符串', () => {
    const parsed = parseFrontmatter('---\ntitle:\n  nested: true\ntype: 3\n---\n', 10)
    assert.equal(parsed.title, undefined)
    assert.equal(parsed.type, '3')
  })

  it('正文超过读取上限时标记 truncated', () => {
    const parsed = parseFrontmatter('没有 frontmatter 的开头', 10_000)
    assert.equal(parsed.truncated, true)
  })
})
