// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOTE_MAX_SIZE, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH } from '../../lib/constants.js'
import { noteDisplaySize, placeNote } from '../../lib/client/notes/hooks/useWallLayout.js'

const note = (over = {}) => ({
  id: 'n1',
  kind: /** @type {const} */ ('note'),
  schema: 1,
  title: '',
  body: '',
  color: /** @type {const} */ ('yellow'),
  x: 0,
  y: 0,
  z: 1,
  width: 208,
  height: 168,
  trashed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
  ...over,
})

describe('便签渲染尺寸', () => {
  it('旧便签的过小尺寸会被夹到当前最小值，避免工具条被挤出', () => {
    assert.ok(NOTE_MIN_WIDTH >= 148, '最小宽度要容得下五点颜色 + 垃圾桶与内边距')
    const size = noteDisplaySize(note({ width: 120, height: 60 }))
    assert.equal(size.width, NOTE_MIN_WIDTH)
    assert.equal(size.height, NOTE_MIN_HEIGHT)
  })

  it('纵向无限画布：Y 不被可视高度夹住，X 仍固定在墙宽内', () => {
    const placed = placeNote(note({ x: 500, y: 1200 }), 0, { width: 600, height: 400 })
    assert.equal(placed.y, 1200, '便签可以落在屏幕下方')
    assert.ok(placed.x <= 600 - placed.width, '横向仍夹在固定宽度内')
  })

  it('正常尺寸与上限保持不变', () => {
    assert.deepEqual(noteDisplaySize(note()), { width: 208, height: 168 })
    assert.deepEqual(noteDisplaySize(note({ width: NOTE_MAX_SIZE + 100, height: NOTE_MAX_SIZE + 100 })), {
      width: NOTE_MAX_SIZE,
      height: NOTE_MAX_SIZE,
    })
  })
})
