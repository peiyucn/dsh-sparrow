import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildNavPinCss, CONTENT_MAX_SIDE_CLEARANCE_PX, NAV_ARIA_LABELS, slotSelector } from '../lib/nav-pin.js'

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

    it('宽度钳制 应该 捕获官方宽度值并钳到对话列减两倍留白', () => {
      assert.ok(css.includes('--dsh-nav-pin-official-width: var(--dsh-chat-content-width)'))
      assert.ok(css.includes('--dsh-chat-content-width: min('))
      assert.ok(css.includes(`calc(var(--dsh-conversation-column-width) - ${CONTENT_MAX_SIDE_CLEARANCE_PX * 2}px)`))
      assert.ok(css.includes('max(640px'))
    })

    it('宽度钳制 应该 覆盖滚动体与两侧拖拽条', () => {
      assert.ok(css.includes('[data-conversation-scroll],\n[data-width-handle]'))
      assert.ok(css.includes('[data-width-handle]'))
    })

    it('宽度钳制 应该 同步重算输入卡片最大宽度', () => {
      assert.ok(css.includes('--dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px)'))
    })

    it('留白常量 应该 大于官方 88px', () => {
      assert.ok(CONTENT_MAX_SIDE_CLEARANCE_PX > 88)
    })

    it('空标签集 应该 返回空串（不注入无选择器规则）', () => {
      assert.equal(buildNavPinCss([]), '')
    })

    it('非法断点（0 / 负数 / NaN / Infinity）应该 回退默认 700px', () => {
      for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const css = buildNavPinCss(NAV_ARIA_LABELS, bad)
        assert.ok(css.includes('@container (max-width: 700px)'), `断点 ${bad} 未回退`)
        assert.ok(!css.includes(`(max-width: ${bad}px)`), `断点 ${bad} 未回退`)
      }
    })

    it('生成样式 应该 花括号配对（规则结构完整）', () => {
      const open = (css.match(/\{/gu) ?? []).length
      const close = (css.match(/\}/gu) ?? []).length
      assert.equal(open, close)
      assert.ok(open > 0)
    })
  })

  describe('slotSelector 转义', () => {
    it('标签含双引号 应该 转义为选择器安全的字符串', () => {
      assert.equal(
        slotSelector('say "hi"'),
        '[data-conversation-scroll] div:has(> nav[aria-label="say \\"hi\\""])',
      )
    })

    it('标签含反斜杠 应该 转义为选择器安全的字符串', () => {
      assert.equal(
        slotSelector('a\\b'),
        '[data-conversation-scroll] div:has(> nav[aria-label="a\\\\b"])',
      )
    })
  })
})
