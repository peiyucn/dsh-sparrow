// @ts-check
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { MAX_REVIEW_FILE_BYTES } from '../../../lib/constants.js'
import { resolveReviewTarget } from '../../../lib/host/notebook/review-target.js'

describe('review target resolution', () => {
  /** @type {string} */
  let root
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'desk-one-review-'))
    await writeFile(join(root, 'note.md'), '---\ntitle: 会议记录\n---\n正文')
    await writeFile(join(root, 'plain.txt'), 'hello')
    await writeFile(join(root, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02]))
    await writeFile(join(root, 'huge.txt'), 'x'.repeat(MAX_REVIEW_FILE_BYTES + 1))
    await mkdir(join(root, 'sub'), { recursive: true })
    await writeFile(join(root, 'sub', 'deep.txt'), 'deep')
  })
  after(async () => { await rm(root, { recursive: true, force: true }) })

  it('markdown：取 frontmatter 标题、kind=markdown、hash 为 sha256', async () => {
    const target = await resolveReviewTarget({ cwd: root, path: 'note.md' })
    assert.equal(target.title, '会议记录')
    assert.equal(target.kind, 'markdown')
    assert.equal(target.path, 'note.md')
    assert.match(target.hash, /^[0-9a-f]{64}$/u)
    assert.equal(target.cwd, root)
  })

  it('纯文本：标题取文件名、kind=text，支持子目录', async () => {
    const plain = await resolveReviewTarget({ cwd: root, path: 'plain.txt' })
    assert.equal(plain.title, 'plain')
    assert.equal(plain.kind, 'text')
    const deep = await resolveReviewTarget({ cwd: root, path: 'sub/deep.txt' })
    assert.equal(deep.title, 'deep')
    assert.equal(deep.path, 'sub/deep.txt')
  })

  it('拒绝工作区外、缺失、二进制、超大与相对 cwd', async () => {
    await assert.rejects(resolveReviewTarget({ cwd: root, path: '../outside.txt' }))
    await assert.rejects(resolveReviewTarget({ cwd: root, path: 'missing.txt' }))
    await assert.rejects(resolveReviewTarget({ cwd: root, path: 'binary.bin' }))
    await assert.rejects(resolveReviewTarget({ cwd: root, path: 'huge.txt' }))
    await assert.rejects(resolveReviewTarget({ cwd: 'relative/dir', path: 'note.md' }))
  })
})
