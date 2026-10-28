// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BACKDROP_SELECTOR,
  REQUIRED_CSS_FEATURES,
  backdropPlan,
  boostAlpha,
  buildBackdropCss,
  tonePreview,
} from '../lib/backdrop.js'
import { BACKDROP_CLASS, CONTENT_ATTR, PLAIN_ATTR, RIGHT_PANEL_ATTR } from '../lib/constants.js'
import { DEFAULT_SETTINGS } from '../lib/tones.js'

describe('backdrop: 地面光层', () => {
  const css = buildBackdropCss()

  it('三道光都在、位置/方向原样（形状常量不变）', () => {
    assert.equal((css.match(/radial-gradient\(/gu) ?? []).length, 3, '地面层三道光')
    assert.match(css, /ellipse 80vw 45vh at 50% -10vh/u)
    assert.match(css, /ellipse 70vw 45vh at 50% 112vh/u)
    assert.match(css, /ellipse 38vw 58vh at 0% -6vh/u)
  })

  it('座位：清掉官方实色底，不再有黑块 / wash / 额外打光', () => {
    const seat = /body:not\(\[[^\]]+\]\) \[data-phase='active'\] \[data-composer-seat\] \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    assert.ok(seat.includes('background: transparent'), '座位完全透明，让页面底光透出')
    assert.ok(!seat.includes('background-image'), '不重绘座位的背景光')
    assert.ok(!seat.includes('box-shadow'), '不补 inset 打光')
  })

  it('固定全屏、z-index 在内容之下、深色轴 screen 混合', () => {
    assert.match(css, new RegExp(`\\.${BACKDROP_CLASS} \\{[^}]*position: fixed`, 'u'))
    assert.match(css, new RegExp(`\\.${BACKDROP_CLASS} \\{[^}]*z-index: 80`, 'u'))
    assert.ok(!css.includes('mix-blend-mode'), '地面层不用混合模式（性能基准显示全屏 screen 混合是最大结构性成本）')
  })

  it('内容层 / 右栏的层序不变式仍在', () => {
    assert.ok(css.includes(`[${CONTENT_ATTR}]`), '内容层应用 z-index')
    assert.ok(css.includes(`[${RIGHT_PANEL_ATTR}]`), '右栏应用 z-index')
    assert.match(css, new RegExp(`body:not\\(\\[${PLAIN_ATTR}\\]\\) \\[data-conversation-scroll\\] \\{[^}]*z-index: 81`, 'u'))
    assert.match(css, new RegExp(`body:not\\(\\[${PLAIN_ATTR}\\]\\) \\[data-sidebar-right-panel\\][^{]*\\{[^}]*z-index: 82`, 'u'))
  })

  it('特性门覆盖本插件真正依赖的三项能力', () => {
    const probes = REQUIRED_CSS_FEATURES.map(feature => feature.probe).join(' ')
    for (const probe of ['radial-gradient(', 'color-mix(']) assert.ok(probes.includes(probe))
  })
})

describe('backdrop: 渲染计划与预览', () => {
  it('官方默认档隐藏整层；有色调时给出三道光', () => {
    assert.equal(backdropPlan('dark', { lightTone: 'official', darkTone: 'official' }).hidden, true)
    const violet = backdropPlan('dark', { lightTone: 'official', darkTone: 'violet' })
    assert.equal(violet.hidden, false)
    assert.notEqual(violet.top, '')
    assert.notEqual(violet.bottom, '')
    assert.notEqual(violet.left, '')
  })

  it('默认设置（深轴 violet）在深色轴上作画', () => {
    assert.equal(backdropPlan('dark', DEFAULT_SETTINGS).hidden, false)
  })

  it('boostAlpha 只放大 rgba、倍数 1 原样返回', () => {
    assert.equal(boostAlpha('rgba(1, 2, 3, 0.5)', 1), 'rgba(1, 2, 3, 0.5)')
    assert.equal(boostAlpha('rgba(1, 2, 3, 0.5)', 2), 'rgba(1, 2, 3, 1.000)')
    assert.equal(boostAlpha('color-mix(in srgb, red 50%, blue)', 3), 'color-mix(in srgb, red 50%, blue)')
  })

  it('色调卡预览：官方默认档是纯底色，有光时给渐变', () => {
    assert.equal(tonePreview('dark', 'official').backgroundImage, 'none')
    assert.match(tonePreview('dark', 'violet').backgroundImage, /radial-gradient/u)
  })

  it('背景层选择器按标记属性定位', () => {
    assert.equal(BACKDROP_SELECTOR, '[data-dsh-theme-tone]')
  })
})
