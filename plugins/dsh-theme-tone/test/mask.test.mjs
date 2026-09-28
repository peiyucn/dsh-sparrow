/**
 * 弹窗遮罩模糊（`src/mask.ts`）的守卫。
 *
 * 这一层极易**静默失效**：它靠**哈希类名的稳定后缀**（`[class*='_mask']`）匹配，
 * 官方一旦重命名后缀，规则不报错、只是不再命中 —— 观感悄悄退回 rc.2 的「无模糊」。
 * 故本文件逐条钉住产物与三条不变式。
 *
 * 背景：官方 0.1.7-rc.2 把 `--dsw-mask-blur` 从 `blur(2px)` 改成 `none`
 * （提交 fdd14a0989，连注释都改写了，且有 e2e 断言钉住）—— 这是**官方有意**的，
 * 不是我们改坏的。owner 要求加回来，并决定两个档位都恢复。
 * 证据链：`docs/upstream/0.1.7-rc.2-mask-blur.md`
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MASK_BLUR_RESTORED, MASK_SELECTOR, buildMaskCss } from '../lib/mask.js'
import { PLAIN_ATTR } from '../lib/constants.js'

/** 剥掉注释后的 CSS（全表 `includes` 会被注释里的字样喂饱 —— 本仓库踩过这个坑）。 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('mask：弹窗遮罩模糊', () => {
  const css = buildMaskCss()
  const clean = stripComments(css)

  it('应该 恢复成官方 0.1.5 的那个值', () => {
    // 官方 0.1.5-rc.3 / 0.1.6-alpha.2 / 0.1.7-alpha.1 / 0.1.7-rc.1 都是 blur(2px)，
    // 只有 0.1.7-rc.2 改成 none。
    assert.equal(MASK_BLUR_RESTORED, 'blur(2px)', '恢复值应等于官方历史值')
    assert.ok(clean.includes(MASK_BLUR_RESTORED), '产物里要真的用上该值')
  })

  it('⛔ 必须**不带**官方默认门（owner 定案：两个档位都恢复）', () => {
    // 这是全插件**第 2 处**刻意动官方默认外观（第 1 处 = 悬停卡 HOVER_CARD_ANCHOR）。
    // 一旦有人「顺手」给它加门，官方默认档下模糊又没了 —— owner 要的正是那个档也有。
    assert.ok(
      !clean.includes(PLAIN_ATTR),
      `本表不得出现官方默认门（${PLAIN_ATTR}）—— owner 要求两个档都恢复`,
    )
  })

  it('⛔ 必须在**遮罩元素自身**重设变量，不得改官方全局变量', () => {
    // 原因：--dsw-mask-blur 有第 4 个消费点用的是 `filter`（滤自身内容）而非 backdrop：
    //   ui-settings-account/DesktopOnboarding.module.css:13
    //   .blurred { filter: var(--dsw-mask-blur); }
    // 全局改会把引导页整页糊掉。
    assert.ok(clean.includes(MASK_SELECTOR), `必须用遮罩选择器 ${MASK_SELECTOR}`)
    const at = clean.indexOf(MASK_SELECTOR)
    const block = clean.slice(at, clean.indexOf('}', at))
    assert.match(block, /--dsw-mask-blur\s*:/u, '要在遮罩元素上重设该变量')
    // 不得在 body / :root 上覆盖（那才是「改官方全局变量」）
    assert.ok(
      !/(?:^|\})\s*(?:body|:root)\s*\{[^}]*--dsw-mask-blur/u.test(clean),
      '不得在 body / :root 上覆盖该变量 —— 会波及 filter 消费点',
    )
  })

  it('⛔ 不得硬编码 backdrop-filter（要沿用官方自己那条规则）', () => {
    // 官方规则是 `backdrop-filter: var(--dsw-mask-blur)`。我们只改变量 ⇒
    // 官方哪天改回 blur(2px) 或换别的值，我们自动跟随；硬编码就断了这条跟随。
    assert.ok(
      !/backdrop-filter/u.test(clean),
      '不得自己写 backdrop-filter —— 只重设变量，让官方规则取到',
    )
  })

  it('选择器必须收窄到遮罩 —— 不得用 [aria-hidden] 之类会命中插件自有元素的写法', () => {
    // 本插件自己的背景层也带 aria-hidden="true"（真机实测），用它会误伤。
    assert.ok(
      !/aria-hidden/u.test(clean),
      '不得用 [aria-hidden] 定位遮罩 —— 本插件背景层也带该属性',
    )
    assert.ok(!/dsh-theme-tone/u.test(clean), '遮罩选择器不应涉及插件自有类名')
  })

  it('⛔ 必须覆盖**两种**遮罩写法（官方哈希类名 + 自家 role=presentation）', () => {
    // ## 为什么（2026-09-27，owner：「归档页，云端文件页弹出后背景虚化也没有」）
    //
    // 第一版只写了 `[class*='_mask']` —— 那只命中**官方**的哈希遮罩类名。
    // 而本仓库自家的 dsh-archive-manage / dsh-file-manage 用的是
    // `<div role="presentation" style="backdropFilter: var(--dsw-mask-blur)">`，
    // 类名是 `dsh-*-confirm-overlay`，**不含 `_mask`** ⇒ 完全没被覆盖
    // ⇒ 那两个页面**没有虚化**（实测 `backdrop-filter: none`）。
    //
    // 两条都必须有，且 role 那条**要限定「自己声明了该变量」这个用法特征** ——
    // `role="presentation"` 本身很泛（面板容器也常用），无条件命中会给无关元素建上下文。
    assert.ok(MASK_SELECTOR.includes("_mask"), '要覆盖官方哈希遮罩类名')
    assert.ok(
      /\[role='presentation'\]/u.test(MASK_SELECTOR) && /--dsw-mask-blur/u.test(MASK_SELECTOR),
      '要覆盖自家插件的 role="presentation" 遮罩，且必须限定 style 含 --dsw-mask-blur',
    )
    // 产物里两条都要出现
    assert.ok(clean.includes("_mask"), '产物缺官方遮罩那条')
    assert.match(clean, /\[role='presentation'\]/u, '产物缺自家遮罩那条')
  })
})
