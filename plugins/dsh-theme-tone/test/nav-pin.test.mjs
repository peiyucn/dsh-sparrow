/**
 * dsh-theme-tone：轮次导航 + 宽度钳制（自 `dsh-nav-pin` 并入，见 `docs/spec/09-nav-pin-merge.md`）。
 *
 * ⚠️ 与 nav-pin 原版的**唯一实质差异**：四段规则现在**全部带色调门**（方案 §3.1 决策 3）。
 * 原版那几条断言（选择器形状、断点、命中区、宽度钳制公式）逐条保留 —— 它们钉的是同一批契约；
 * 新增的是「带门」与「官方档不产出」两组守卫。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildNavPinCss, CONTENT_MAX_SIDE_CLEARANCE_PX, NAV_ARIA_LABELS, slotSelector } from '../lib/nav-pin.js'
import { PLAIN_ATTR } from '../lib/constants.js'

/** 去掉注释后的样式表文本（判据只看声明；注释里会引用反面教材）。 */
const stripped = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, '')

/** 色调门前缀（与实现同源，防止两边各写一份）。 */
const GATE = `body:not([${PLAIN_ATTR}])`

describe('dsh-theme-tone 轮次导航与宽度钳制（自 nav-pin 并入）', () => {
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
    const rules = stripped(css)

    it('应该 同时覆盖 zh / en 两套官方标签', () => {
      assert.deepEqual(NAV_ARIA_LABELS, ['Turn navigation', '轮次导航'])
      for (const label of NAV_ARIA_LABELS) {
        assert.ok(rules.includes(`nav[aria-label="${label}"]`), `缺少标签 ${label}`)
      }
    })

    it('应该 以 display: block 压过官方隐藏规则（断点外恒显）', () => {
      assert.ok(rules.includes('display: block'))
    })

    it('应该 把隐藏断点设为 700px 并默认隐身', () => {
      assert.ok(rules.includes('@container (max-width: 700px)'))
      assert.ok(rules.includes('opacity: 0'))
    })

    it('应该 hover 与键盘 focus 时浮现', () => {
      assert.ok(rules.includes(':hover'))
      assert.ok(rules.includes(':focus-within'))
      assert.ok(rules.includes('opacity: 1'))
    })

    it('浮层 应该 不带边框底色阴影（与官方宽屏轨道形态一致）', () => {
      assert.ok(!rules.includes('background:'))
      assert.ok(!rules.includes('border:'))
      assert.ok(!rules.includes('border-radius'))
      assert.ok(!rules.includes('box-shadow'))
    })

    it('应该 提供 ::before 命中区扩展（左缘 -16px 向左扩出 frame，上下各 8px）', () => {
      assert.ok(rules.includes('nav::before'))
      assert.ok(rules.includes('inset: -8px 0 -8px -16px'))
    })

    it('应该 为 reduced-motion 关闭过渡', () => {
      assert.ok(rules.includes('prefers-reduced-motion: reduce'))
      assert.ok(rules.includes('transition: none'))
    })

    it('应该 复刻官方高度过渡（不因覆盖 transition 吃掉高度动画）', () => {
      assert.ok(rules.includes('height 220ms'))
    })

    it('自定义断点 应该 反映在容器查询与说明注释中', () => {
      const custom = buildNavPinCss(NAV_ARIA_LABELS, 640)
      assert.ok(custom.includes('@container (max-width: 640px)'))
    })

    it('宽度钳制 应该 捕获官方宽度值并钳到对话列减两倍留白', () => {
      assert.ok(rules.includes('--dsh-nav-pin-official-width: var(--dsh-chat-content-width)'))
      assert.ok(rules.includes('--dsh-chat-content-width: min('))
      assert.ok(rules.includes(`calc(var(--dsh-conversation-column-width) - ${CONTENT_MAX_SIDE_CLEARANCE_PX * 2}px)`))
      assert.ok(rules.includes('max(640px'))
    })

    it('宽度钳制 应该 覆盖滚动体与两侧拖拽条', () => {
      assert.ok(rules.includes('> [data-conversation-scroll],\n'))
      assert.ok(rules.includes('[data-width-handle] {'))
    })

    it('⛔ 宽度钳制 的捕获点必须落在真正定义 --dsh-chat-content-width 的元素上', () => {
      // 回归守卫（owner 真机报「官方调整对话界面整体宽度的按钮没了、两边很挤」）：
      // 0.1.5-rc.2 里该变量定义在 .root（= [data-phase]），0.1.7-rc.1 起改到 .body
      // （[data-phase] 的子元素）。捕获写在 [data-phase] 上时，rc.1 下解析为空 →
      // min(空, …) 让整条自定义属性 invalid → 滚动体与拖拽条的宽度轴全失效。
      const body = '[data-phase] > div:has(> [data-conversation-scroll])'
      assert.ok(
        rules.includes(`${body} {\n  --dsh-nav-pin-official-width: var(--dsh-chat-content-width);`),
        '捕获必须写在那层「含滚动体的直接子元素」上（两版都成立）',
      )
      assert.ok(!/\[data-phase\] \{\n\s*--dsh-nav-pin-official-width/u.test(rules), '不得再捕获在 [data-phase] 自身上')
      assert.ok(rules.includes(`${body} > [data-conversation-scroll]`))
      assert.ok(rules.includes(`${body} [data-width-handle]`))
      assert.ok(rules.includes('--dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px)'))
    })

    it('宽度钳制 应该 全部由官方 [data-phase] 标记守卫（标记消失即整体不生效）', () => {
      const capture = rules.indexOf('--dsh-nav-pin-official-width: var(--dsh-chat-content-width)')
      assert.ok(capture > 0, '应捕获官方宽度值')
      const selectorFor = (needle) => {
        const at = rules.indexOf(needle)
        assert.ok(at > 0, `找不到声明 ${needle}`)
        const open = rules.lastIndexOf('{', at)
        const prevClose = rules.lastIndexOf('}', open)
        return rules.slice(prevClose + 1, open).split('\n').filter(l => l.trim() !== '').pop() ?? ''
      }
      for (const needle of [
        '--dsh-nav-pin-official-width: var(--dsh-chat-content-width)',
        '--dsh-chat-content-width: min(',
        '--dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px)',
      ]) {
        const sel = selectorFor(needle)
        assert.ok(sel.includes('[data-phase]'), `规则必须带 [data-phase] 守卫：${sel.trim()}`)
      }
    })

    it('宽度钳制 应该 同步重算输入卡片最大宽度', () => {
      assert.ok(rules.includes('--dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px)'))
    })

    it('留白常量 应该 大于官方 88px', () => {
      assert.ok(CONTENT_MAX_SIDE_CLEARANCE_PX > 88)
    })

    it('空标签集 应该 返回空串（不注入无选择器规则）', () => {
      assert.equal(buildNavPinCss([]), '')
    })

    it('非法断点（0 / 负数 / NaN / Infinity）应该 回退默认 700px', () => {
      for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const out = buildNavPinCss(NAV_ARIA_LABELS, bad)
        assert.ok(out.includes('@container (max-width: 700px)'), `断点 ${bad} 未回退`)
        assert.ok(!out.includes(`(max-width: ${bad}px)`), `断点 ${bad} 未回退`)
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

  /**
   * 合并新增的核心契约（方案 §3.1 决策 3 + §4「theme-tone 侧需要新增的测试」1–4）。
   * 判据：**"改变官方有意的设计选择"（断点、留白）必须带门**；
   * 官方默认档（body 带 PLAIN_ATTR）下这些规则一条都不许命中。
   */
  describe('色调门（方案 §3.1 决策 3 —— 四段全部带门）', () => {
    const css = buildNavPinCss()
    const rules = stripped(css)

    it('⛔ display: block 那条也必须带门（它是"改官方断点"的核心动作，漏了契约当场作废）', () => {
      // 单独钉这一条：其余三条即使带了门，漏掉它 = 官方默认档下导航也不再按 900px 消失。
      const at = rules.indexOf('display: block')
      assert.ok(at > 0, '应产出一条 display: block')
      const open = rules.lastIndexOf('{', at)
      const prevClose = rules.lastIndexOf('}', open)
      const sel = rules.slice(prevClose + 1, open)
      assert.ok(sel.includes(GATE), `display: block 那条缺少色调门：${sel.trim().slice(-120)}`)
    })

    it('四段（恒显 / 浮现 / 命中区 / 宽度钳制 / reduced-motion）全部带门', () => {
      // 逐段定点取样，而不是「全文数一遍」—— 后者漏一段也照样通过。
      const probes = [
        ['恒显 display:block', 'display: block'],
        ['浮现 opacity:0', 'opacity: 0'],
        ['命中区 ::before', 'nav::before'],
        ['宽度钳制 min()', '--dsh-chat-content-width: min('],
        ['卡片宽度重算', '--dsh-composer-card-max-width:'],
        ['reduced-motion 过渡', 'transition: none'],
      ]
      for (const [label, needle] of probes) {
        const at = rules.indexOf(needle)
        assert.ok(at > 0, `缺少「${label}」`)
        const open = rules.lastIndexOf('{', at)
        const prevClose = rules.lastIndexOf('}', open)
        // 选择器可能跨多行（两条 aria-label 各一行），取到上一个规则结束为止
        const sel = rules.slice(prevClose + 1, open)
        assert.ok(sel.includes(GATE), `「${label}」缺少色调门：${sel.trim().slice(-120)}`)
      }
    })

    it('⛔ 官方默认档语义：门上写的是 body:not([plain])，故 plain 生效时整段不命中', () => {
      // 这里钉的是「门的形式」而不是跑一次 CSS 引擎：`body:not([data-dsh-theme-tone-plain])`
      // 与 backdrop / glass 两张表完全同形（同一 PLAIN_ATTR、同一 GATE 前缀写法）。
      assert.ok(css.includes(GATE), '产出必须带门')
      assert.ok(!/^\s*\[data-conversation-scroll\][^{]*\{/mu.test(rules.replace(/^.*?display: block/mu, '')), '不得存在不带门的选择器块')
      // 逐块断言：任何以 [data-conversation-scroll] 或 [data-phase] 打头的规则块，其选择器都要含门
      const blocks = rules.split('}').filter(b => b.includes('{'))
      for (const block of blocks) {
        const sel = block.slice(0, block.indexOf('{'))
        if (!/\[data-(conversation-scroll|phase|width-handle)\]/u.test(sel)) continue
        assert.ok(sel.includes(GATE), `不带门的选择器块：${sel.trim().slice(-120)}`)
      }
    })

    it('返回文本里不得出现旧的 nav-pin 自有标记（已并入 theme-tone 单表）', () => {
      assert.ok(!css.includes('data-dsh-nav-pin'), '不得再引用 nav-pin 的 style 标记')
    })
  })
})
