// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lineChanges } from '../../lib/client/notebook/review-changes.js'

/** Build `count` numbered lines (`line 1`..`line count`) joined with newlines plus a final one. */
const numbered = (count, prefix = 'line') => {
  const lines = []
  for (let index = 1; index <= count; index += 1) lines.push(`${prefix} ${index}`)
  return `${lines.join('\n')}\n`
}

describe('审阅改动行', () => {
  it('文本相同（仅末尾换行差异也算相同）返回 null', () => {
    assert.equal(lineChanges('a\nb\n', 'a\nb\n'), null)
    assert.equal(lineChanges('a\nb\n', 'a\nb'), null)
    assert.equal(lineChanges('', ''), null)
  })

  it('末尾追加行只标新增行', () => {
    assert.deepEqual(lineChanges('a\nb\n', 'a\nb\nc\n'), { addedLines: [3], removed: 0 })
  })

  it('开头插入行标为第 1 行', () => {
    assert.deepEqual(lineChanges('b\nc\n', 'a\nb\nc\n'), { addedLines: [1], removed: 0 })
  })

  it('替换中间一行：新行标新增、旧行计删除', () => {
    assert.deepEqual(lineChanges('a\nb\nc\n', 'a\nB\nc\n'), { addedLines: [2], removed: 1 })
  })

  it('删除行只计删除、不高亮新文本', () => {
    assert.deepEqual(lineChanges('a\nb\nc\n', 'a\nc\n'), { addedLines: [], removed: 1 })
  })

  it('重复内容不会把尾部空行误标成改动', () => {
    assert.deepEqual(lineChanges('x\nx\n', 'x\nx\nx\n'), { addedLines: [3], removed: 0 })
  })

  it('大文件里的小改动只高亮改到的行（前后缀裁剪 + 有界编辑搜索）', () => {
    const oldLines = []
    const newLines = []
    for (let index = 1; index <= 5000; index += 1) oldLines.push(`line ${index}`)
    for (let index = 1; index <= 5000; index += 1) newLines.push(index === 2501 ? 'line 2501 revised' : `line ${index}`)
    assert.deepEqual(lineChanges(`${oldLines.join('\n')}\n`, `${newLines.join('\n')}\n`), {
      addedLines: [2501],
      removed: 1,
    })
  })

  it('超过编辑搜索上限时与官方 diff 一致：整段视为替换', () => {
    const oldText = numbered(300, 'old')
    const newText = numbered(300, 'new')
    const changes = lineChanges(oldText, newText)
    assert.ok(changes !== null)
    assert.equal(changes.removed, 300)
    assert.equal(changes.addedLines.length, 300)
    assert.equal(changes.addedLines[0], 1)
    assert.equal(changes.addedLines[299], 300)
  })

  it('空文本按官方行数规则处理（空串是零行）', () => {
    assert.deepEqual(lineChanges('', 'a\nb\n'), { addedLines: [1, 2], removed: 0 })
    assert.deepEqual(lineChanges('a\nb\n', ''), { addedLines: [], removed: 2 })
  })
})
