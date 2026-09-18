import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SWEEP_ANCHORS,
  SWEEP_PLATE_ALPHA,
  SWEEP_PLATE_LAYERS,
  SWEEP_SHAPE_MASK,
  buildSweepCss,
} from '../lib/sweep.js'
import { BACKDROP_GRADIENTS } from '../lib/backdrop.js'
import { GRAIN_TILE_VARIABLE, PLAIN_ATTR } from '../lib/constants.js'

const css = buildSweepCss()
// 注释里会引用官方那条 `width: 300px` 做反面说明，结构断言必须先剥注释（踩过一次）。
const rules = css.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('官方运行扫光带：照我们自己的背景画（A 方案）', () => {
  it('锚点必须**收窄**到官方那 5 处 —— 泛匹配曾误伤无关伪元素盖住对话区底部', () => {
    // 上一版锚点是 `[data-state='running']::after` + `... [class*='_row']::after`：
    // data-state 是通用属性、_row 是通用后缀 → 官方给元素写 ::after 的理由五花八门
    // （分隔线 / 描边 / 拖拽柄 / 展开箭头…）→ 一堆无关伪元素被刷上不透明背景板，
    // owner 报「整个对话区域的底部好像被一个纯色块给盖住了」。这条守卫钉死收窄判据。
    for (const anchor of SWEEP_ANCHORS) {
      assert.ok(anchor.includes("[data-state='running']"), `必须锚在 running 态上：${anchor}`)
      assert.ok(
        anchor.includes('[data-variant]') || anchor.includes('[data-tool]'),
        `必须同时要求 data-variant / data-tool（只有官方那 5 处同时具备）：${anchor}`,
      )
    }
    // 反例：不得回退成只按 data-state 泛匹配
    assert.ok(
      !SWEEP_ANCHORS.includes("body [data-state='running']::after"),
      '不得回退成裸 [data-state] 泛匹配',
    )
    assert.ok(
      !SWEEP_ANCHORS.includes("body [data-state='running'] [class*='_row']::after"),
      '不得回退成 data-state + _row 的泛匹配',
    )
  })

  it('范围必须只有我们色调档 —— owner 定案「只在我们色调上实现，官方默认色调不要动」', () => {
    for (const anchor of SWEEP_ANCHORS) {
      const gated = anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
      assert.ok(css.includes(gated), `带门选择器必须在表里：${gated}`)
    }
    assert.ok(!css.includes('body [data-state'), '不得出现不带门的选择器')
  })

  it('背景板必须**画全**：底色 + 同源的光 + 颗粒，一项都不许少', () => {
    // owner：「官方就是根据自己的背景做的脉冲条，我们也应该根据自己的背景画这个脉冲条。」
    // 官方背景 = 纯 bg-base；我们背景 = bg-base + 背景层的光 + 颗粒 → 三项都要在。
    assert.ok(rules.includes('background-color: var(--dsw-alias-bg-base)'), '底色用同一个 token')
    assert.ok(SWEEP_PLATE_LAYERS.includes(GRAIN_TILE_VARIABLE), '**颗粒必须在**')
    assert.ok(SWEEP_PLATE_LAYERS.includes(BACKDROP_GRADIENTS), '光必须与背景层同源（不复制数值）')
    assert.ok(rules.includes(`var(${GRAIN_TILE_VARIABLE}, none)`), '颗粒瓦片要进 background-image')
    // ⚠️ 必须**单个** fixed：background-image 有 4 层，`scroll, fixed` 会被循环补齐成
    // `scroll, fixed, scroll, fixed` —— 第 1、3 段渐变退回按元素自身盒子解析。
    assert.ok(
      rules.includes('background-attachment: fixed;'),
      '必须是单个 fixed（应用到全部层），不能写 scroll, fixed',
    )
    assert.ok(!rules.includes('scroll, fixed'), '不得写 scroll, fixed（层数不足会被循环补齐）')
  })

  it('强度与形状都交给一块 mask：峰值 60%、停点与官方一致', () => {
    // 60% 进 mask 而不是颜色里，是因为颗粒的强度烘在贴图里、没法单独压 alpha。
    assert.equal(SWEEP_PLATE_ALPHA, 0.6, '比例必须与官方的 60% 对齐 —— 那正是「看不见」的原因')
    assert.ok(SWEEP_SHAPE_MASK.includes('transparent 0%'), `左端全透明：${SWEEP_SHAPE_MASK}`)
    assert.ok(SWEEP_SHAPE_MASK.includes('rgb(0 0 0 / 60%)'), `峰值必须是 60%：${SWEEP_SHAPE_MASK}`)
    assert.ok(SWEEP_SHAPE_MASK.includes('55%'), `峰位与官方一致（55%）：${SWEEP_SHAPE_MASK}`)
    assert.ok(SWEEP_SHAPE_MASK.includes('transparent 100%'), `右端全透明：${SWEEP_SHAPE_MASK}`)
    assert.ok(rules.includes('-webkit-mask-image:'), '要带 -webkit- 前缀')
    assert.ok(rules.includes('mask-image:'), '要带标准属性')
  })

  it('不得退回「只画一个颜色」的老写法，也不得再引入 blur / 擦除', () => {
    assert.ok(!/linear-gradient\(90deg[^)]*--dsw-alias-bg-base/u.test(rules), '不得把底色塞进颜色渐变')
    assert.ok(!/backdrop-filter/u.test(rules), 'blur 那版已被否（「效果不行」）')
    assert.ok(!/mix-blend-mode/u.test(rules), '擦除那版已被否（「更显眼」）')
    assert.ok(!/background: none/u.test(rules), '「不画」丢功能，已被否')
  })

  it('官方几何一律不动 —— width / 位置 / 动画都留在官方手里', () => {
    assert.ok(
      !/width\s*:/u.test(rules),
      '扫光带规则不得出现 width（官方 keyframes 0% 的 left:-300px 与带宽数值耦合）',
    )
    assert.ok(!/left\s*:|top\s*:|bottom\s*:|content\s*:|animation\s*:/u.test(rules), '定位与动画都留在官方手里')
  })

  it('不需要 !important —— 本表特异度已高于官方', () => {
    assert.ok(!css.includes('!important'), '压得住官方，别引入 !important')
  })
})
