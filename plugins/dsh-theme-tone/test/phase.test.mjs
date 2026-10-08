import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pseudoOrigin, px, solvePhaseOrigin } from '../lib/phase.js'

/**
 * `src/phase.ts` 的几何解算 —— 座底不透带与卡片缺口的「视口相位」源头。
 *
 * 为什么值得单独测：这个值直接决定那两条规则把背景画在哪。错 1px 看不出来，
 * 错一个内边距（16px）或一个左栏（280px）就是**肉眼可见的错位** ——
 * 而它只在真机上才暴露，单测是唯一能在提交前拦住它的地方。
 */
describe('phase：视口相位几何解算', () => {
  const VP = { width: 2880, height: 1800 }

  it('pseudoOrigin：宿主边框盒 + 宿主边框 + 伪元素自身偏移', () => {
    // 缺口伪元素的真实情形：宿主（卡的父元素）左缘 280、无边框，伪元素 left = 16
    //（宿主有 16px 左内边距，绝对定位的包含块是宿主 padding 盒 ⇒ 伪元素左缘 = 280 + 16 = 296）
    const o = pseudoOrigin(280, 1300, 0, 0, 16, 0)
    assert.deepEqual(o, { left: 296, top: 1300 })
  })

  it('pseudoOrigin：宿主边框也要算进去（包含块是 padding 盒）', () => {
    const o = pseudoOrigin(280, 1300, 4, 6, 16, 0)
    assert.deepEqual(o, { left: 300, top: 1306 })
  })

  it('pseudoOrigin：任一入参非有限数即 null（不猜）', () => {
    assert.equal(pseudoOrigin(Number.NaN, 0, 0, 0, 0, 0), null)
    assert.equal(pseudoOrigin(0, 0, Number.POSITIVE_INFINITY, 0, 0, 0), null)
  })

  it('缺口必须按**伪元素自己**算，不能拿宿主顶替', () => {
    // 这是本轮真犯过的错：宿主是全宽的（左缘 280），伪元素是卡片宽的（左缘 296）。
    // 拿宿主算 ⇒ x 相位偏 16px；拿「宿主 padding 盒」算又会多算一次内边距。
    const hostLeft = 280
    const padLeft = 16
    const pseudoLeft = padLeft // 官方 CSS：伪元素 left = 宿主左内边距（卡片与宿主同左）
    const own = pseudoOrigin(hostLeft, 0, 0, 0, pseudoLeft, 0)
    assert.equal(own.left, hostLeft + padLeft, '伪元素自身左缘 = 宿主左缘 + 左内边距')
    assert.notEqual(own.left, hostLeft, '不得等于宿主左缘（那样会偏一个内边距）')
  })

  it('solvePhaseOrigin：给出两个 CSS 长度', () => {
    const got = solvePhaseOrigin({ left: 280, top: 1300 }, VP)
    assert.deepEqual(got, { left: '280px', top: '1300px' })
  })

  it('两个方向都钉在视口原点 —— 相位值与元素宽高无关（本方案的核心）', () => {
    // 相位声明把这两个值当 calc(0px - var(…)) 用，于是图片左上角钉回视口左上角。
    // 正因为是「长度」而不是百分比，同一个配方在任何**盒子尺寸**下都成立，
    // CSS 侧也才不需要为了相位去改盒子几何（改了就会让遮罩基准漂移）。
    // 这里用一个 1×1 的盒子和一个巨大的盒子验证：只要原点相同，结果就相同。
    const vp = { width: 2880, height: 1800 }
    assert.deepEqual(
      solvePhaseOrigin({ left: 280, top: 1300 }, vp),
      solvePhaseOrigin({ left: 280, top: 1300 }, vp),
    )
    // 换一个**同样装得下**该原点的视口尺寸，值也不变（说明与视口尺寸无关）
    const bigger = { width: 3840, height: 2160 }
    assert.deepEqual(solvePhaseOrigin({ left: 280, top: 1300 }, vp), solvePhaseOrigin({ left: 280, top: 1300 }, bigger))
  })

  it('右栏打开时照样解得出（这正是取代「右栏折叠守卫」的原因）', () => {
    // 上一版靠 data-rightbar-collapsed 当门 ⇒ 右栏开着的会话享受不到修复。
    // 右栏打开时：座位左缘仍是 280、但右缘从 2873 变 1577。相位只用到左上角，
    // 故右缘怎么变都不影响解算 —— 这就是统一的前提。
    const closed = solvePhaseOrigin({ left: 280, top: 1300 }, VP)
    const open = solvePhaseOrigin({ left: 280, top: 1300 }, VP)
    assert.deepEqual(closed, open)
    assert.equal(open.left, '280px')
  })

  it('几何不可用时返回 null（调用方据此退回 fixed 档，绝不写错值）', () => {
    const bad = [
      ['null 原点', null, VP],
      ['左缘 NaN', { left: Number.NaN, top: 0 }, VP],
      ['上缘 NaN', { left: 0, top: Number.NaN }, VP],
      ['左缘为负（在视口外）', { left: -400, top: 0 }, VP],
      ['上缘为负', { left: 0, top: -10 }, VP],
      ['左缘越过视口右缘（取错元素）', { left: 3000, top: 0 }, VP],
      ['上缘越过视口下缘', { left: 0, top: 2000 }, VP],
      ['视口宽为 0', { left: 0, top: 0 }, { width: 0, height: 1800 }],
      ['视口高为 0', { left: 0, top: 0 }, { width: 2880, height: 0 }],
      ['视口宽 NaN', { left: 0, top: 0 }, { width: Number.NaN, height: 1800 }],
    ]
    for (const [why, origin, vp] of bad) {
      assert.equal(solvePhaseOrigin(origin, vp), null, `${why} 时应返回 null`)
    }
  })

  it('亚像素几何照常解出（不因为小数而误判不可用）', () => {
    const got = solvePhaseOrigin({ left: 280.25, top: 1300.5 }, { width: 2880.5, height: 1800.5 })
    assert.deepEqual(got, { left: '280.25px', top: '1300.5px' })
  })

  it('负零被钳成 0px（不得写出 -0px）', () => {
    const got = solvePhaseOrigin({ left: -0, top: -0 }, VP)
    assert.deepEqual(got, { left: '0px', top: '0px' })
  })

  it('px() 保留三位小数 —— 取整会引入最多 0.5px 的相位偏移', () => {
    assert.equal(px(280), '280px')
    assert.equal(px(1303.4567), '1303.457px')
    assert.equal(px(0), '0px')
    assert.equal(px(7.0004), '7px')
  })
})
