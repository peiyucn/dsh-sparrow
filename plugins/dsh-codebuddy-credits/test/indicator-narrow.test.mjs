import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 顶栏 CodeBuddy 标记的**窄化契约**
 * （`src/client/CodeBuddyCreditsIndicator.tsx`）。
 *
 * owner 2026-10-02：「对话区域宽度变窄后，咱们 codebuddy 插件的和其他元素重叠了，
 * 我看官方的智能体团队按钮有缩放变化策略，咱们 codebuddy 的是不是也可以当位置不够用
 * 的时候，变成 codebuddy 没有文字的那版 logo？之前有一个彩色版但是没有文字的 logo」。
 *
 * 读源码而不是渲染（本插件没有 client 侧 DOM 测试环境）——与 `credit-dialog.test.mjs`
 * 同一取舍。这里钉住的是**四条容易悄悄退化**的契约：
 *
 * 1. 两个形态**都**渲染（少渲染一个 ⇒ 切过去就是空白）；
 * 2. 显隐**只由样式表**给 `display`，JSX 里**不许**写内联 `display`
 *    （内联优先级高于样式表 ⇒ `@container` 里的 `display: none` 会失效，
 *    本轮实测踩过：阈值到了、模式却没切）；
 * 3. 机制必须是**容器查询**且锚在**匿名容器**上（官方 `.titleRow` 的
 *    `container-type: inline-size`），不许退回 JS 监听 / 断点常量；
 * 4. 方标必须是那个**彩色**版（带 radialGradient、无文字组），不是单色版。
 */
const SOURCE = new URL('../src/client/CodeBuddyCreditsIndicator.tsx', import.meta.url)
const source = await readFile(SOURCE, 'utf8')

/** 取 `const NAME = <数字>`。 */
function numberConst(name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*([\\d.]+)`, 'u').exec(source)
  assert.ok(m, `找不到常量 ${name}`)
  return Number(m[1])
}

/** 取某个 SVG 常量的字面量。 */
function svgConst(name) {
  const line = source.split(/\r?\n/u).find(l => l.includes(`const ${name} =`))
  assert.ok(line, `找不到 SVG 常量 ${name}`)
  const start = line.indexOf("'")
  const end = line.lastIndexOf("'")
  assert.ok(end > start, `${name} 的字符串字面量没闭合`)
  return line.slice(start + 1, end)
}

/** 注入样式表那串数组的原文（`style.textContent = [ ... ].join('\n')`）。 */
function styleArrayText() {
  const at = source.indexOf('style.textContent = [')
  assert.ok(at >= 0, '找不到 style.textContent 数组')
  const end = source.indexOf("].join('\\n')", at)
  assert.ok(end > at, '找不到 .join 收尾')
  return source.slice(at, end)
}

describe('CodeBuddy 顶栏标记：窄化（容器查询）', () => {
  it('两个形态 应该 都渲染（少一个 ⇒ 切过去是空白）', () => {
    // 宽档 = 带字样的横排 lockup；窄档 = 无文字的彩色方标。
    assert.match(source, /className="ccb-mark-wide"/u, '缺少宽档 span（ccb-mark-wide）')
    assert.match(source, /className="ccb-mark-narrow"/u, '缺少窄档 span（ccb-mark-narrow）')
    // 两个都必须真把 svg 渲染出来（而不是占位空 span）。
    const trig = source.slice(source.indexOf('const triggerButton'), source.indexOf('const trigger ='))
    assert.match(trig, /__html:\s*LOGO_SVG/u, '宽档必须渲染 LOGO_SVG（带字样）')
    assert.match(trig, /__html:\s*MARK_SQUARE_SVG/u, '窄档必须渲染 MARK_SQUARE_SVG（无文字方标）')
  })

  it('⛔ JSX 里 不得 写内联 display —— 会压死 @container 的 display:none', () => {
    // 实测根因：React 写在 style 上的是**内联**声明，优先级高于样式表。
    // 一旦给这两个 span 写 display，@container 里那条 display:none 就永远不生效
    // —— 阈值到了、模式却不切（TEMP/cb9.mjs 第一版正是这个症状）。
    const trig = source.slice(source.indexOf('const triggerButton'), source.indexOf('const trigger ='))
    for (const [name, re] of [['宽档', /ccb-mark-wide[\s\S]{0,200}?\}\}/u], ['窄档', /ccb-mark-narrow[\s\S]{0,200}?\}\}/u]]) {
      const block = re.exec(trig)
      assert.ok(block, `没取到${name} span`)
      assert.ok(!/display\s*:/u.test(block[0]),
        `${name} span 的 style 里不得出现 display（内联会压死容器查询）：${block[0]}`)
    }
  })

  it('机制 必须是 @container，且锚在**匿名**容器上（对齐官方 team 按钮）', () => {
    const styles = styleArrayText()
    assert.match(styles, /@container \(max-width: \$\{MARK_COLLAPSE_PX\}px\)/u,
      '必须用容器查询、阈值取 MARK_COLLAPSE_PX（与官方 TeamAction 同款机制）')
    // 匿名容器：不得写 container-name（官方 .titleRow 是匿名的，写名字会解析不到）。
    assert.ok(!/container-name/u.test(styles), '不得给容器起名（官方 .titleRow 是匿名容器）')
    // 也不得靠 JS 监听做窄化（ResizeObserver / window.resize 那套）——纯 CSS 就够。
    // ⚠️ 必须先**剥注释**：本文件的文档注释里就写着「零 ResizeObserver」这句，
    //    不剥的话这条会命中自己的注释（本轮踩过）。
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    const afterTrigger = code.slice(code.indexOf('const triggerButton'))
    assert.ok(!/ResizeObserver/u.test(afterTrigger),
      '窄化不得靠 ResizeObserver（纯 CSS 就够，且不会有布局抖动）')
    assert.match(styles, /\.ccb-mark-wide \{ display: inline-flex; \}/u, '样式表要给宽档默认 display')
    assert.match(styles, /\.ccb-mark-narrow \{ display: none; \}/u, '样式表要给窄档默认 display:none')
  })

  it('窄档应该 顺带收内边距（方标是方形，8px 占比偏大）', () => {
    // 实测：宽档按钮 84px、窄档 28px（一行省 56px）。内边距不收的话窄档会偏胖。
    const styles = styleArrayText()
    const at = styles.indexOf('@container')
    const containerBlock = styles.slice(at)
    assert.match(containerBlock, /\.ccb-indicator-button \{ padding: 0 5px; \}/u,
      '窄档那条容器查询里应收内边距到 5px')
    assert.match(styles, /padding: 0 8px/u, '宽档内边距仍是 8px')
  })

  it('窄档方标 必须是**彩色**版（带渐变、无文字组）—— owner 要的就是这个', () => {
    const square = svgConst('MARK_SQUARE_SVG')
    assert.match(square, /viewBox="0 0 24 24"/u, '方标应是 24×24 的方块')
    assert.match(square, /radialGradient/u, '方标必须带品牌渐变（彩色版），不是单色版')
    assert.match(square, /stop-color="#2EA99D"/u, '渐变起点应是品牌青绿 #2EA99D')
    assert.match(square, /stop-color="#6C4DFF"/u, '渐变终点应是品牌紫 #6C4DFF')
    assert.ok(!/<g transform/u.test(square), '方标不得含文字组（它就该是「没有文字的那版」）')
    // 宽档反过来：必须有文字组。
    const wide = svgConst('LOGO_SVG')
    assert.match(wide, /viewBox="0 0 90 24"/u, '宽档应是 90×24 的横排 lockup')
    assert.match(wide, /<g transform/u, '宽档必须含文字组（带字样）')
    // 两者必须是**同一个方块**：初始 path（圆角方块那段）逐字相同 ⇒ 切换时品牌视觉连续。
    const corner = (svg) => /<path d="(M18\.821 0H5\.18[^"]*)"/u.exec(svg)?.[1]
    assert.ok(corner(square) !== undefined, '方标里找不到圆角方块那段 path')
    assert.equal(corner(square), corner(wide), '两个形态的方块必须是同一段 path（切换时视觉连续）')
  })

  it('阈值 应该 落在实测定出的区间里，且两个形态共用一个数', () => {
    const collapse = numberConst('MARK_COLLAPSE_PX')
    // 实测（TEMP/cb10.mjs）：容器 ≥656 时 84px 横排也不重叠；容器 ≤616 起被压。
    // 阈值必须落在这条缝里 —— 低于 616 会漏掉已被压的档，过高则过早丢字样。
    assert.ok(collapse >= 616 && collapse <= 700,
      `阈值应在实测定出的 616..700 之间，实际 ${collapse}`)
    assert.equal(collapse, 656, '阈值锁定为实测定值 656（改它必须重跑 TEMP/cb10.mjs 那类量测）')
    // 两个形态共用同一字号 ⇒ 只有一个旋钮。
    const styles = styleArrayText()
    assert.ok(!/font-size:\s*\d+px/u.test(styles), '字号应由 MARK_FONT_PX 一处给出，不写死在样式表里')
  })
})
