// @ts-check
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ensureNoteFile } from '../../../lib/host/notebook/files.js'

/** Minimal DeskStore facade capturing one identity request (the real store is covered elsewhere). */
const fakeStore = /** @type {any} */ ({
  ensureNoteFile: async (/** @type {{ rootPath: string, path: string, hash: string }} */ input) => ({
    id: 'note_file_fake',
    kind: 'note-file',
    schema: 1,
    createdAt: '',
    updatedAt: '',
    revision: 1,
    ...input,
  }),
})

describe('notebook files', () => {
  /** @type {string} */
  let root
  before(async () => { root = await mkdtemp(join(tmpdir(), 'desk-one-files-')) })
  after(async () => { await rm(root, { recursive: true, force: true }) })

  it('ensureNoteFile：库内文件按内容哈希解析身份', async () => {
    await writeFile(join(root, 'note.md'), '# hello\n', 'utf8')
    const file = await ensureNoteFile(fakeStore, root, './note.md')
    assert.equal(file.path, 'note.md')
    assert.equal(file.rootPath, root)
    assert.equal(file.hash, createHash('sha256').update('# hello\n').digest('hex'))
  })

  it('ensureNoteFile：文件不存在时按既有语义返回 404', async () => {
    await assert.rejects(ensureNoteFile(fakeStore, root, 'missing.md'), (/** @type {any} */ error) => {
      assert.equal(error.code, 'UNKNOWN_NOTE')
      assert.equal(error.status, 404)
      return true
    })
  })

  it('ensureNoteFile：`..` 越界相对路径被拒绝', async () => {
    await assert.rejects(ensureNoteFile(fakeStore, root, '../escape.md'), (/** @type {any} */ error) => {
      assert.equal(error.code, 'BAD_BODY')
      return true
    })
  })

  it('ensureNoteFile：符号链接 / 目录联接指向库外时抛 FORBIDDEN（不越界读文件）', async (t) => {
    const outside = await mkdtemp(join(tmpdir(), 'desk-one-outside-'))
    try {
      await writeFile(join(outside, 'secret.md'), 'secret\n', 'utf8')
      // A directory junction is creatable without elevation on Windows; POSIX treats 'junction'
      // as a normal directory symlink, so the same containment check is exercised on both hosts.
      try {
        await symlink(outside, join(root, 'link-outside'), 'junction')
      } catch (error) {
        t.skip(`当前环境不能创建符号链接/目录联接：${String(error)}`)
        return
      }
      await assert.rejects(ensureNoteFile(fakeStore, root, 'link-outside/secret.md'), (/** @type {any} */ error) => {
        assert.equal(error.code, 'FORBIDDEN')
        assert.equal(error.status, 403)
        assert.equal(error.message, '文件必须位于工作区内')
        return true
      })
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})
