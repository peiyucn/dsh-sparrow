import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildNavPinCss, NAV_ARIA_LABELS, slotSelector } from '../lib/nav-pin.js'

describe('dsh-nav-pin 纯逻辑', () => {
  describe('slotSelector', () => {
    it('给定官方标签 应该 生成 nav 直接父元素的定位选择器', () => {
      assert.equal(
        slotSelector('Turn navigation'),
        '[data-conversation-scroll] div:has(> nav[aria-label="Turn navigation"])',
      )
    })
  })

  describe('buildNavPinCss', () => {
    const css = buildNavPinCss()

    it('应该 同时覆盖 zh / en 两套官方标签', () => {
      assert.deepEqual(NAV_ARIA_LABELS, ['Turn navigation', '轮次导航'])
      for (const label of NAV_ARIA_LABELS) {
        assert.ok(css.includes(`nav[aria-label="${label}"]`), `缺少标签 ${label}`)
      }
    })

    it('应该 以 display: block 压过官方隐藏规则（断点外恒显）', () => {
      assert.ok(css.includes('display: block'))
    })

    it('应该 把隐藏断点设为 700px 并默认隐身', () => {
      assert.ok(css.includes('@container (max-width: 700px)'))
      assert.ok(css.includes('opacity: 0'))
    })

    it('应该 hover 与键盘 focus 时浮现', () => {
      assert.ok(css.includes(':hover'))
      assert.ok(css.includes(':focus-within'))
      assert.ok(css.includes('opacity: 1'))
    })

    it('浮层 应该 不带边框底色阴影（与官方宽屏轨道形态一致）', () => {
      assert.ok(!css.includes('background:'))
      assert.ok(!css.includes('border:'))
      assert.ok(!css.includes('border-radius'))
      assert.ok(!css.includes('box-shadow'))
    })

    it('应该 提供 ::before 命中区扩展', () => {
      assert.ok(css.includes('nav::before'))
      assert.ok(css.includes('inset: -8px 0 -8px 16px'))
    })

    it('应该 为 reduced-motion 关闭过渡', () => {
      assert.ok(css.includes('prefers-reduced-motion: reduce'))
      assert.ok(css.includes('transition: none'))
    })

    it('应该 复刻官方高度过渡（不因覆盖 transition 吃掉高度动画）', () => {
      assert.ok(css.includes('height 220ms'))
    })

    it('自定义断点 应该 反映在容器查询与说明注释中', () => {
      const custom = buildNavPinCss(NAV_ARIA_LABELS, 640)
      assert.ok(custom.includes('@container (max-width: 640px)'))
    })
  })
})
