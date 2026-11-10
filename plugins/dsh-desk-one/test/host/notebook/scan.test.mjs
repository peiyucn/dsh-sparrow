// @ts-check
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { scanNotebook } from '../../../lib/host/notebook/scan.js'

describe('notebook scan', () => {
  /** @type {string} */
  let root
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'desk-one-notebook-'))
    await writeFile(join(root, 'note.md'), '---\ntitle: 第一篇\ntags:\n  - ai\n---\n正文')
    await writeFile(join(root, 'plain.MD'), '# 没有 frontmatter')
    await writeFile(join(root, 'ignored.txt'), '不是 markdown')
    await mkdir(join(root, 'sub'), { recursive: true })
    await writeFile(join(root, 'sub', 'deep.md'), '---\ntype: meeting\n---\n正文')
    await mkdir(join(root, '.obsidian'), { recursive: true })
    await writeFile(join(root, '.obsidian', 'workspace.md'), '# 应用状态')
    await mkdir(join(root, '.note2md'), { recursive: true })
    await writeFile(join(root, '.note2md', 'tool.md'), '# 工具内部')
    // Distinct mtimes so ordering is deterministic (files otherwise share a timestamp).
    await utimes(join(root, 'note.md'), new Date('2026-11-10T00:00:00Z'), new Date('2026-11-10T00:00:00Z'))
    await utimes(join(root, 'plain.MD'), new Date('2026-11-09T00:00:00Z'), new Date('2026-11-09T00:00:00Z'))
    await utimes(join(root, 'sub', 'deep.md'), new Date('2026-11-08T00:00:00Z'), new Date('2026-11-08T00:00:00Z'))
  })
  after(async () => { await rm(root, { recursive: true, force: true }) })

  it('只收 markdown、跳过排除目录、路径是相对根的 / 分隔形式', async () => {
    const result = await scanNotebook(root, new AbortController().signal)
    assert.deepEqual(result.pages.map(page => page.entry.path), ['note.md', 'plain.MD', 'sub/deep.md'])
    assert.equal(result.truncated, false)
  })

  it('取 frontmatter 字段，缺 title 时用文件名', async () => {
    const result = await scanNotebook(root, new AbortController().signal)
    const note = result.pages.find(page => page.entry.path === 'note.md')
    assert.equal(note?.entry.title, '第一篇')
    assert.deepEqual(note?.entry.tags, ['ai'])
    assert.equal(note?.entry.hasFrontmatter, true)
    assert.equal(note?.entry.bodyChars, 2)
    const plain = result.pages.find(page => page.entry.path === 'plain.MD')
    assert.equal(plain?.entry.title, 'plain')
    assert.equal(plain?.entry.hasFrontmatter, false)
  })

  it('结果按 mtime 从新到旧排序', async () => {
    const result = await scanNotebook(root, new AbortController().signal)
    const times = result.pages.map(page => page.entry.mtimeMs)
    assert.deepEqual(times, [...times].sort((left, right) => right - left))
  })

  it('signal 已中止时直接抛错', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(scanNotebook(root, controller.signal))
  })
})
