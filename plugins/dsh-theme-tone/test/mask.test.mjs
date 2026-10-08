/**
 * 弹窗遮罩模糊（`src/mask.ts`）的守卫：靠**哈希类名的稳定后缀**（`[class*='_mask']`）匹配。
 * 官方改后缀时不报错、只是不再命中，观感静默退回「无模糊」，故须逐条钉住产物与三条不变式。
 * 恢复 blur 是**有意**为之：官方 0.1.7-rc.2 把 `--dsw-mask-blur` 改成了 `none`。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MASK_BLUR_RESTORED, MASK_SELECTOR, buildMaskCss } from '../lib/mask.js'
import { PLAIN_ATTR } from '../lib/constants.js'

/** 剥掉注释后的 CSS：全表 includes 会被注释里的字样喂饱。 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('mask：弹窗遮罩模糊', () => {
  const css = buildMaskCss()
  const clean = stripComments(css)

  it('应该 恢复成官方 0.1.5 的那个值', () => {
    // 0.1.7-rc.2 之前的各版本都是这个值。
    assert.equal(MASK_BLUR_RESTORED, 'blur(2px)', '恢复值应等于官方历史值')
    assert.ok(clean.includes(MASK_BLUR_RESTORED), '产物里要真的用上该值')
  })

  it('⛔ 必须**不带**官方默认门（owner 定案：两个档位都恢复）', () => {
    // 刻意不带门：加了门官方默认档就没有模糊，而那一档正是要恢复的（全插件第 2 处有意动官方外观）。
    assert.ok(
      !clean.includes(PLAIN_ATTR),
      `本表不得出现官方默认门（${PLAIN_ATTR}）—— owner 要求两个档都恢复`,
    )
  })

  it('⛔ 必须在**遮罩元素自身**重设变量，不得改官方全局变量', () => {
    // 不能在全局改：--dsw-mask-blur 还有第 4 个消费点用 filter（滤自身内容），全局改会把引导页整页糊掉。
    assert.ok(clean.includes(MASK_SELECTOR), `必须用遮罩选择器 ${MASK_SELECTOR}`)
    const at = clean.indexOf(MASK_SELECTOR)
    const block = clean.slice(at, clean.indexOf('}', at))
    assert.match(block, /--dsw-mask-blur\s*:/u, '要在遮罩元素上重设该变量')
    assert.ok(
      !/(?:^|\})\s*(?:body|:root)\s*\{[^}]*--dsw-mask-blur/u.test(clean),
      '不得在 body / :root 上覆盖该变量 —— 会波及 filter 消费点',
    )
  })

  it('⛔ 不得硬编码 backdrop-filter（要沿用官方自己那条规则）', () => {
    // 只重设变量、不自己写 backdrop-filter：官方改值我们自动跟随，硬编码就断了这条跟随。
    assert.ok(
      !/backdrop-filter/u.test(clean),
      '不得自己写 backdrop-filter —— 只重设变量，让官方规则取到',
    )
  })

  it('选择器必须收窄到遮罩 —— 不得用 [aria-hidden] 之类会命中插件自有元素的写法', () => {
    assert.ok(
      !/aria-hidden/u.test(clean),
      '不得用 [aria-hidden] 定位遮罩 —— 本插件背景层也带该属性',
    )
    assert.ok(!/dsh-theme-tone/u.test(clean), '遮罩选择器不应涉及插件自有类名')
  })

  it('⛔ 必须覆盖**两种**遮罩写法（官方哈希类名 + 自家 role=presentation）', () => {
    // 两条都必须有：官方哈希遮罩类名（含 `_mask`），以及自家插件的 `role="presentation"` 遮罩
    // （类名 dsh-*-confirm-overlay 不含 `_mask`）。role 那条要限定「自己声明了该变量」——
    // `role="presentation"` 本身很泛（面板容器也常用），无条件命中会给无关元素建上下文。
    assert.ok(MASK_SELECTOR.includes("_mask"), '要覆盖官方哈希遮罩类名')
    assert.ok(
      /\[role='presentation'\]/u.test(MASK_SELECTOR) && /--dsw-mask-blur/u.test(MASK_SELECTOR),
      '要覆盖自家插件的 role="presentation" 遮罩，且必须限定 style 含 --dsw-mask-blur',
    )
    assert.ok(clean.includes("_mask"), '产物缺官方遮罩那条')
    assert.match(clean, /\[role='presentation'\]/u, '产物缺自家遮罩那条')
  })
})
