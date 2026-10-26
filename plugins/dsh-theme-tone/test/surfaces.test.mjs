// @ts-check
// 浮层样式表契约（2026-10-27 做减法后）：**不再给任何浮层叠我们的光层**，只保留两处「必须由选择器做」的覆盖 ——
// 悬停卡的面/字跟随主题、输入框卡片里的圆形图标按钮去底。
//
// 历史（为什么整族删掉）：曾给菜单族 / 对话框 / 树弹层 / 任务列表 / 提示条 / 问答卡 / 停靠卡各叠三层 `::after`
// 光（顶光 / 底光 / 左光）。后果是「有的浮层有打光、有的没」、同一菜单内外两层光（模型列表 hover 的淡框），
// 且每个面多一个负 z 伪元素层。官方 rc.3 已把菜单族统一到 `MenuSurface`，浮层色相只需 token 覆盖。

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HOVER_CARD_ANCHOR, HOVER_CARD_TEXT_TOKENS, PANEL_VARIABLE, PLAIN_ATTR } from '../lib/constants.js'
import { COMPOSER_ICON_BUTTON_SCOPE, buildSurfaceCss } from '../lib/surface.js'

/** 剥掉注释（结构统计只认真实声明；注释里出现的反引号/示例不能让守卫误判）。 */
const clean = (css) => css.replace(/\/\*[\s\S]*?\*\//gu, '')

describe('浮层样式（surface.ts）：只吃色，不再叠光层', () => {
  const css = buildSurfaceCss()
  const code = clean(css)

  it('⛔ 不得再出现我们的「三道光」图层（surfaceLayers 已随做减法删除）', () => {
    assert.ok(!/radial-gradient/u.test(code), '浮层不得再叠自己的渐变光层（统一吃官方材质 + token 染色）')
    assert.ok(!/background-image\s*:/u.test(code), '浮层规则不得再声明 background-image')
  })

  it('⛔ 不得再出现 backdrop-filter / content 覆盖层（那是被删掉的 ::after 载体）', () => {
    assert.ok(!/backdrop-filter/u.test(code), '浮层不得声明 backdrop-filter（材质归官方）')
    assert.ok(!/content\s*:\s*''/u.test(code), '不应再有新建伪元素的覆盖层规则')
  })

  it('悬停卡：面走面板变量、字走主题感知 token（官方默认档也修，不带门）', () => {
    const body = new RegExp(`${HOVER_CARD_ANCHOR.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*\\{([^}]*)\\}`, 'u').exec(code)
    assert.ok(body !== null, '悬停卡面规则应存在')
    assert.ok(body[1].includes(`var(${PANEL_VARIABLE}`), '面必须走面板变量（官方默认档下它正是官方 layer3）')
    assert.ok(body[1].includes('!important'), '面覆盖要能压过官方写死的字面色')
    for (const { suffix, token } of HOVER_CARD_TEXT_TOKENS) {
      assert.ok(code.includes(`[class*='${suffix}']`), `悬停卡缺字色覆盖：${suffix}`)
      assert.ok(code.includes(`var(${token})`), `悬停卡字色必须用主题 token：${token}`)
    }
    // ⚠️ 悬停卡与图标按钮都是「官方把值写死」的特例，**两个档都要修** ⇒ 不得带官方默认门。
    assert.ok(!code.includes(PLAIN_ATTR), 'surface 表不得带官方默认门（它只做官方写死值的最小修正）')
  })

  it('输入框卡片里的圆形图标按钮：默认去底（保留官方 hover 底）', () => {
    assert.ok(code.includes(`${COMPOSER_ICON_BUTTON_SCOPE} {`), '图标按钮作用域规则应存在')
    assert.ok(code.includes('--dsw-specific-selector: transparent'), '默认底必须置透明（hover 底不重写）')
  })

  it('样式表花括号平衡（多余 } 会吞掉下一条规则）', () => {
    let depth = 0
    let min = 0
    for (const ch of code) {
      if (ch === '{') depth += 1
      else if (ch === '}') { depth -= 1; min = Math.min(min, depth) }
    }
    assert.equal(min, 0, '不得出现多余的右花括号')
    assert.equal(depth, 0, '样式表结尾不得留下未闭合规则')
  })
})
