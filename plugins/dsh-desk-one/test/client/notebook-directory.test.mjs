// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parentDirectory } from '../../lib/client/notebook/directory.js'

describe('notebook picker: parent directory', () => {
  it('普通目录取上一级', () => {
    assert.equal(parentDirectory('/ws/notes/sub'), '/ws/notes')
    assert.equal(parentDirectory('C:/ws/notes'), 'C:/ws')
  })

  it('反斜杠与尾部分隔符先归一化', () => {
    assert.equal(parentDirectory('C:\\ws\\notes\\'), 'C:/ws')
  })

  it('盘符根与文件系统根停在自己', () => {
    assert.equal(parentDirectory('C:/'), 'C:/')
    assert.equal(parentDirectory('/'), '/')
    assert.equal(parentDirectory('/ws'), '/')
  })
})
