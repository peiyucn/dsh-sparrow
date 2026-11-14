// @ts-check
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { DeskError } from '../../../lib/host/http.js'
import { NotebookHost } from '../../../lib/host/notebook/host.js'
import { workspaceRootOf } from '../../../lib/host/notebook/workspace-root.js'

/**
 * Minimal DeskStore facade for one file identity. The real store is covered elsewhere; here the
 * point is the root the host resolves and reads through.
 * @returns {any} the fake store.
 */
function makeStore() {
  /** @type {any} */
  let record
  return {
    ensureNoteFile: async (/** @type {{ rootPath: string, path: string, hash: string }} */ input) => {
      record = { id: 'note_file_test', kind: 'note-file', schema: 1, createdAt: '', updatedAt: '', revision: 1, ...input }
      return record
    },
    getNoteFile: (/** @type {string} */ id) => (id === 'note_file_test' ? record : undefined),
  }
}

describe('批注：按工作区打开文件', () => {
  /** @type {string} */
  let root
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'desk-one-open-'))
    await writeFile(join(root, 'note.md'), '# hello\n', 'utf8')
  })
  after(async () => { await rm(root, { recursive: true, force: true }) })

  it('openAt 用工作区根解析文件身份与正文', async () => {
    const host = new NotebookHost(makeStore())
    const { file, page } = await host.openAt(root, 'note.md')
    assert.equal(file.path, 'note.md')
    assert.equal(file.rootPath, root)
    assert.match(page.body, /hello/u)
  })

  it('openById 用记录里的根读回正文', async () => {
    const host = new NotebookHost(makeStore())
    await host.openAt(root, 'note.md')
    const { page } = await host.openById('note_file_test')
    assert.match(page.body, /hello/u)
  })

  it('openById 未知身份 404', async () => {
    const host = new NotebookHost(makeStore())
    await assert.rejects(
      () => host.openById('missing'),
      (error) => error instanceof DeskError && error.status === 404,
    )
  })

  it('openAt 拒绝跳出工作区的路径', async () => {
    const host = new NotebookHost(makeStore())
    await assert.rejects(
      () => host.openAt(root, '../outside.md'),
      (error) => error instanceof DeskError && error.code === 'BAD_BODY',
    )
  })

  it('workspaceRootOf 只信注册表：未知 id 404、空 id 400', () => {
    const registry = { get: (/** @type {string} */ id) => (String(id) === 'ws-1' ? { path: 'C:/ws' } : undefined) }
    assert.equal(workspaceRootOf(registry, 'ws-1'), 'C:/ws')
    assert.throws(() => workspaceRootOf(registry, 'missing'), (error) => error instanceof DeskError && error.status === 404)
    assert.throws(() => workspaceRootOf(registry, '   '), (error) => error instanceof DeskError && error.status === 400)
  })
})
