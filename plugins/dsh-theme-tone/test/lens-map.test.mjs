// @ts-check
/**
 * bezel 透镜位移图的几何契约：圆角矩形 SDF → 边缘位移最大、向内 bezel 内平方衰减到 0；
 * 方向指向卡片内部（直边轴向 / 圆角径向）；四边同构、左右上下镜像对称；bezel 外与中心中性；
 * depth 线性缩放。canvas / DOM 无关，纯函数直接跑。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildLensMap } from '../lib/client/lens-map.js'

const WIDTH = 400
const HEIGHT = 160
const RADIUS = 20
const BEZEL = 20
const DEPTH = 12
const NEUTRAL = 128

const map = buildLensMap({ width: WIDTH, height: HEIGHT, radius: RADIUS, bezel: BEZEL, depth: DEPTH })

/**
 * 取像素四个通道。
 * @param {number} x
 * @param {number} y
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function pixel(x, y) {
  const index = (y * map.width + x) * 4
  return { r: map.data[index], g: map.data[index + 1], b: map.data[index + 2], a: map.data[index + 3] }
}

/**
 * 位移（CSS px，R/G 减 128）。
 * @param {number} x
 * @param {number} y
 * @returns {{ dx: number, dy: number }}
 */
function displacement(x, y) {
  const value = pixel(x, y)
  return { dx: value.r - NEUTRAL, dy: value.g - NEUTRAL }
}

describe('lens-map: bezel 透镜位移图', () => {
  it('应该 按卡片尺寸产出 RGBA 图，且所有像素 B=0 / A=255', () => {
    assert.equal(map.width, WIDTH)
    assert.equal(map.height, HEIGHT)
    assert.equal(map.data.length, WIDTH * HEIGHT * 4)
    for (let index = 2; index < map.data.length; index += 4) {
      assert.equal(map.data[index], 0, 'B 通道恒为 0')
      assert.equal(map.data[index + 1], 255, 'A 通道恒为 255')
    }
  })

  it('应该 让中心与 bezel 外的像素保持中性（128,128）', () => {
    for (const [x, y] of [[WIDTH / 2, HEIGHT / 2], [BEZEL + 10, HEIGHT / 2], [WIDTH / 2, BEZEL + 10], [WIDTH / 2, HEIGHT - BEZEL - 10], [WIDTH - BEZEL - 10, HEIGHT / 2]]) {
      const value = pixel(x, y)
      assert.deepEqual(value, { r: NEUTRAL, g: NEUTRAL, b: 0, a: 255 }, `(${x},${y}) 应中性`)
    }
    // 圆角切掉的角区（元素包围盒内、圆角矩形外）也写中性，避免边缘出现脏位移。
    assert.deepEqual(pixel(0, 0), { r: NEUTRAL, g: NEUTRAL, b: 0, a: 255 })
  })

  it('应该 在四边把位移方向指向卡片内部', () => {
    const left = displacement(1, HEIGHT / 2)
    const right = displacement(WIDTH - 2, HEIGHT / 2)
    const top = displacement(WIDTH / 2, 1)
    const bottom = displacement(WIDTH / 2, HEIGHT - 2)
    assert.ok(left.dx > 0, '左缘 dx > 0（向卡内取样）')
    assert.ok(right.dx < 0, '右缘 dx < 0（向卡内取样）')
    assert.ok(top.dy > 0, '上缘 dy > 0（向卡内取样）')
    assert.ok(bottom.dy < 0, '下缘 dy < 0（向卡内取样）')
    assert.ok(Math.abs(left.dy) <= 1 && Math.abs(right.dy) <= 1, '直边中段不应有切向分量')
    assert.ok(Math.abs(top.dx) <= 1 && Math.abs(bottom.dx) <= 1, '直边中段不应有切向分量')
  })

  it('应该 四边镜像对称，且同一到边距离的幅值一致', () => {
    const left = displacement(1, HEIGHT / 2)
    const right = displacement(WIDTH - 2, HEIGHT / 2)
    const top = displacement(WIDTH / 2, 1)
    const bottom = displacement(WIDTH / 2, HEIGHT - 2)
    assert.ok(Math.abs(left.dx + right.dx) <= 1, '左右位移方向相反、大小相等')
    assert.ok(Math.abs(top.dy + bottom.dy) <= 1, '上下位移方向相反、大小相等')
    const magnitudes = [left.dx, -right.dx, top.dy, -bottom.dy].map(value => Math.abs(value))
    for (const magnitude of magnitudes) {
      assert.ok(Math.abs(magnitude - magnitudes[0]) <= 1, '四边在同一到边距离处幅值一致')
    }
  })

  it('应该 在 bezel 内按 (1 - t)^2 衰减，bezel 外归零', () => {
    for (const x of [0, 3, 7, 11, 15, 19]) {
      const distance = x + 0.5
      const expected = DEPTH * (1 - distance / BEZEL) ** 2
      const { dx } = displacement(x, HEIGHT / 2)
      assert.ok(Math.abs(dx - expected) <= 1, `x=${x} 的位移应约等于 depth*(1-t)^2（实际 ${dx}，期望 ${expected.toFixed(2)}）`)
    }
    assert.equal(displacement(20, HEIGHT / 2).dx, 0, '到边距离 = bezel 处归零')
    assert.equal(displacement(30, HEIGHT / 2).dx, 0, 'bezel 外无位移')
  })

  it('应该 在圆角处沿径向指向卡内（角圆心）', () => {
    const { dx, dy } = displacement(8, 8)
    assert.ok(dx > 1 && dy > 1, '左上圆角处位移朝右、朝下（卡内）')
    assert.ok(Math.abs(dx - dy) <= 1, '45° 圆角处 x / y 分量相等')
    // 与「指向卡片中心」的方向点积为正 ⇒ 整体朝内。
    const towardCenter = { x: WIDTH / 2 - 8.5, y: HEIGHT / 2 - 8.5 }
    assert.ok(dx * towardCenter.x + dy * towardCenter.y > 0, '圆角位移方向指向卡片内部')
  })

  it('应该 让 bezel 内每个位移像素都指向卡片内部，且不越出 depth 上限', () => {
    for (let y = 0; y < HEIGHT; y += 3) {
      for (let x = 0; x < WIDTH; x += 3) {
        const { dx, dy } = displacement(x, y)
        assert.ok(Math.abs(dx) <= DEPTH && Math.abs(dy) <= DEPTH, `(${x},${y}) 位移不得超过 depth`)
        if (dx === 0 && dy === 0) continue
        const towardCenter = { x: WIDTH / 2 - (x + 0.5), y: HEIGHT / 2 - (y + 0.5) }
        assert.ok(dx * towardCenter.x + dy * towardCenter.y > 0, `(${x},${y}) 位移应指向卡内`)
      }
    }
  })

  it('应该 让 depth 线性缩放位移（depth=0 时全图中性）', () => {
    const shallow = buildLensMap({ width: WIDTH, height: HEIGHT, radius: RADIUS, bezel: BEZEL, depth: DEPTH / 2 })
    const deep = buildLensMap({ width: WIDTH, height: HEIGHT, radius: RADIUS, bezel: BEZEL, depth: DEPTH })
    const flat = buildLensMap({ width: WIDTH, height: HEIGHT, radius: RADIUS, bezel: BEZEL, depth: 0 })
    /**
     * @param {{ width: number, height: number, data: Uint8ClampedArray }} target
     * @param {number} x
     * @param {number} y
     */
    const at = (target, x, y) => target.data[(y * target.width + x) * 4] - NEUTRAL
    for (const [x, y] of [[1, HEIGHT / 2], [8, 8], [WIDTH / 2, 1]]) {
      const half = at(shallow, x, y)
      const full = at(deep, x, y)
      assert.ok(Math.abs(full - half * 2) <= 2, `depth 翻倍时位移应约翻倍（half=${half}，full=${full}）`)
      assert.equal(at(flat, x, y), 0, 'depth=0 时没有位移')
    }
  })

  it('flipBottom 只把底边编码反向（实际改为向卡内取样），顶 / 左 / 右不变', () => {
    const flipped = buildLensMap({ width: WIDTH, height: HEIGHT, radius: RADIUS, bezel: BEZEL, depth: DEPTH, flipBottom: true })
    /**
     * @param {{ width: number, height: number, data: Uint8ClampedArray }} target
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    const gy = (target, x, y) => target.data[(y * target.width + x) * 4 + 1] - NEUTRAL
    const bottom = gy(flipped, WIDTH / 2, HEIGHT - 2)
    const top = gy(flipped, WIDTH / 2, 1)
    assert.ok(bottom > 0, '底边编码反向后为正（负 scale 后实际朝上 = 卡内）')
    assert.ok(top > 0 && Math.abs(top) === Math.abs(bottom), '顶边保持原方向与幅值')
    assert.equal(gy(flipped, WIDTH / 2, HEIGHT / 2), 0, '中心仍中性')
  })

  it('flipTop 只把顶边编码反向，底 / 左 / 右不变', () => {
    const flipped = buildLensMap({ width: WIDTH, height: HEIGHT, radius: RADIUS, bezel: BEZEL, depth: DEPTH, flipTop: true })
    /**
     * @param {{ width: number, height: number, data: Uint8ClampedArray }} target
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    const gy = (target, x, y) => target.data[(y * target.width + x) * 4 + 1] - NEUTRAL
    const top = gy(flipped, WIDTH / 2, 1)
    const bottom = gy(flipped, WIDTH / 2, HEIGHT - 2)
    assert.ok(top < 0, '顶边编码反向后为负（负 scale 后实际朝下 = 卡内）')
    assert.ok(bottom < 0 && Math.abs(bottom) === Math.abs(top), '底边保持原方向与幅值')
  })
})
