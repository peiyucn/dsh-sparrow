
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findWorkspaceForPath, relativeToWorkspace } from '../../lib/client/notebook/workspaces.js'


const workspaces = [
  { workspaceId: 'w1', path: 'C:/repo', title: 'repo' },
  { workspaceId: 'w2', path: 'C:\\repo\\nested', title: 'nested' },
]

describe('批注入口：工作区匹配', () => {
  it('取最长匹配，嵌套工作区不被父级遮住', () => {
    assert.equal(findWorkspaceForPath(workspaces, 'C:/repo/nested/note.md')?.workspaceId, 'w2')
    assert.equal(findWorkspaceForPath(workspaces, 'C:/repo/other/note.md')?.workspaceId, 'w1')
  })

  it('Windows 驱动器路径大小写折叠', () => {
    assert.equal(findWorkspaceForPath(workspaces, 'c:\\REPO\\note.md')?.workspaceId, 'w1')
    assert.equal(findWorkspaceForPath(workspaces, 'C:\\REPO\\NESTED\\note.md')?.workspaceId, 'w2')
  })

  it('工作区外的文件返回 undefined', () => {
    assert.equal(findWorkspaceForPath(workspaces, 'C:/elsewhere/note.md'), undefined)
  })

  it('相对路径按工作区根切分并统一斜杠', () => {
    assert.equal(relativeToWorkspace('C:\\repo\\nested\\a\\b.md', 'C:\\repo\\nested'), 'a/b.md')
    assert.equal(relativeToWorkspace('C:/repo/note.md', 'C:/repo'), 'note.md')
  })
})
