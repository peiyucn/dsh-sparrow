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
    // ⚠️ 注入的必须是**逐注入点作用域化**后的 svg（mark-ids.ts 的 scopeMarkSvg）：
    //    直接注入原始常量会让同一文档里的多份标共用写死的渐变 id，宽档下渐变方底
    //    整个不画 ⇒ 浅色模式看起来像「logo 没反色」（2026-10-07 owner 报，见下一条）。
    const trig = source.slice(source.indexOf('const triggerButton'), source.indexOf('const trigger ='))
    assert.match(trig, /__html:\s*markWideSvg/u, '宽档必须渲染作用域化后的 LOGO_SVG（带字样）')
    assert.match(trig, /__html:\s*markNarrowSvg/u, '窄档必须渲染作用域化后的 MARK_SQUARE_SVG（无文字方标）')
    assert.ok(!/__html:\s*(LOGO_SVG|MARK_SQUARE_SVG)\b/u.test(source),
      '不得直接注入未作用域化的原始 SVG 常量（多份同 id ⇒ 渐变解析到不可见定义 ⇒ 浅色下不出图）')
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

  it('⛔ 每个品牌标注入点 必须 用**各自不同**的作用域前缀（同前缀 = 同 id，症状复发）', () => {
    // 2026-10-07 owner 报「浅色模式下额度卡里的 logo 好像没反色」的**真根因**：
    // 内联品牌 SVG 的渐变 id 是写死的，同一文档注入多份时 `fill="url(#id)"` 按
    // **文档序第一个**同名元素解析；宽对话区（> MARK_COLLAPSE_PX）下窄档那份是
    // `display:none` ⇒ 面板标题行那份解析到不可见定义 ⇒ 渐变方底整个不画，
    // 只剩硬编码 `fill="#fff"` 的白色字形 ⇒ 浅色底上「看不见 / 像没反色」。
    //
    // ⚠️ 光「加了 useId 前缀」还不够：面板与顶栏窄档用的是**同一枚** MARK_SQUARE_SVG，
    //    若两处共用同一个前缀，两个同名 id 又回到同一文档 ⇒ 宽档下症状原样复发
    //    （本轮实现第一版正是这样，被这条守卫的思路抓到）。故前缀必须逐注入点不同。
    const scopes = [...source.matchAll(/scopeMarkSvg\(\s*([A-Z_]+)\s*,\s*`ccb-logo-\$\{markScope\}([^`]*)`/gu)]
      .map(m => [m[1], m[2]])
    assert.equal(scopes.length, 3,
      `应有 3 处作用域化注入（宽档 lockup / 窄档方标 / 面板方标），实际 ${scopes.length} 处：${JSON.stringify(scopes)}`)
    const prefixes = scopes.map(([, prefix]) => prefix)
    assert.equal(new Set(prefixes).size, prefixes.length,
      `三个注入点的前缀必须互不相同（同前缀 = 同 id = 症状复发），实际 ${JSON.stringify(prefixes)}`)
    // 载入的常量必须是这两枚真值常量，别处不能凭空造标。
    assert.deepEqual(scopes.map(([name]) => name).sort(), ['LOGO_SVG', 'MARK_SQUARE_SVG', 'MARK_SQUARE_SVG'],
      `作用域化应只围绕这两枚真值常量，实际 ${JSON.stringify(scopes)}`)
    // 面板那份与窄档那份都用 MARK_SQUARE_SVG ⇒ 两者前缀必须不同（这条是本条的核心）。
    const squarePrefixes = scopes.filter(([name]) => name === 'MARK_SQUARE_SVG').map(([, prefix]) => prefix)
    assert.equal(squarePrefixes.length, 2, '方标应有两个注入点（顶栏窄档 + 面板标题行）')
    assert.notEqual(squarePrefixes[0], squarePrefixes[1],
      '顶栏窄档与面板标题行都用 MARK_SQUARE_SVG，两者前缀必须不同（否则同 id，宽档下渐变又解析到隐藏那份）')
    // 纯函数化：必须走 mark-ids.ts，不在组件里手写 replace。
    assert.match(source, /import \{ scopeMarkSvg \} from '\.\/mark-ids\.js'/u,
      '必须 import scopeMarkSvg（纯函数与用途分离，便于单测）')
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

  it('⛔ hero 入口的 portal 容器 必须 落在 @container 上下文内（否则窄化恒不命中）', () => {
    // 2026-10-03 全面审计发现的**真缺陷**（上面那条窄化守卫抓不到它）：
    // 容器查询只对**有容器祖先**的元素生效，而官方把 container-type 挂在 .titleRow
    // （ConversationRoot.module.css:71），.titleRow 又是会话根 [data-phase] 的**后代**。
    // 原实现 createPortal(trigger, hero.rootEl) 把入口挂到会话根 ⇒ 没有容器祖先
    // ⇒ 查询恒不命中 ⇒ hero 页入口**永远**是 84px 横排，收不成 28px 方标。
    // 真机实测：hero 相位 .titleRow 宽 376（≤ 阈值 656）时入口仍是 84px，
    // 而 header 变体在同一宽度下正确收成 28px —— 同一个按钮、两种行为。
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    assert.ok(!/createPortal\(trigger,\s*hero\.rootEl\s*\)/u.test(code),
      'hero 入口不得直接 portal 到会话根 —— 那里没有 @container 上下文，窄化恒不命中')
    // 必须经 heroPortalTarget 解析（它取角按钮的父元素 = .titleRow = 容器自己）。
    assert.match(code, /createPortal\(trigger,\s*heroPortalTarget\(hero\.rootEl\)\)/u,
      'hero 入口必须 portal 到 heroPortalTarget(hero.rootEl)')
    // 解析器必须**限定在本会话根内**找角按钮：多会话根并存时 document.querySelector 会取错树。
    const fn = /function heroPortalTarget[\s\S]*?\n\}/u.exec(code)
    assert.ok(fn, '找不到 heroPortalTarget 的定义')
    assert.match(fn[0], /rootEl\.querySelector\(HEADER_CORNER_SELECTOR\)/u,
      'heroPortalTarget 必须在传入的会话根内找角按钮（不得用 document.querySelector）')
    assert.match(fn[0], /\?\?\s*rootEl/u,
      '角按钮取不到时必须退回会话根（良性降级成原行为，不抛错）')
  })
})

describe('CodeBuddy 顶栏标记：面板不得先在旧位置画一帧', () => {
  /**
   * owner 2026-10-02：「codebuddy 图标缩放后，点击弹窗会现在原来位置出现一下」。
   *
   * 根因是**效果时机**（两件事相乘才看得见）：
   * 1. `point` 是 useState、**关闭时不清空** ⇒ 重开时首次渲染直接用上一次的坐标；
   * 2. `position()` 原先写在 `useEffect`（**被动效果**，绘制之后才跑）⇒
   *    那一帧已经按旧坐标画出来了，随后 `setPoint` 再把它挪走。
   *
   * 图标一旦因容器查询缩放，按钮会横移几十像素（84px ↔ 28px），
   * 旧坐标与正确坐标差得远 ⇒ 那一下「跳」肉眼可见。
   *
   * 修法：把「打开时定位」放进 `useLayoutEffect`（提交后、**绘制前**同步跑），
   * 其中的 `setPoint` 同帧内完成重渲染 ⇒ 面板从第一帧就在正确位置。
   *
   * 实测（TEMP/cb21.mjs 因果验证）：把这一行改回 `useEffect`，4 轮里能抓到
   * `[827, 135]` 这种「先旧后新」的帧序列；用 `useLayoutEffect` 时 0/4。
   */
  it('打开时的定位 必须用 useLayoutEffect（被动效果会先画一帧旧坐标）', () => {
    // 修掉注释后再找，避免注释里提到 useLayoutEffect 就把断言喂饱。
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    const layoutCall = /useLayoutEffect\(\(\) => \{\s*if \(!open\) return\s*position\(\)\s*\}, \[open, position\]\)/u
    assert.match(code, layoutCall,
      '「打开时定位」必须放在 useLayoutEffect 里（否则会先在旧坐标画一帧）')
    // 反向：不得同时保留一条同形的 useEffect 定位（那会把被动效果又加回来）。
    const passive = /useEffect\(\(\) => \{\s*if \(!open\) return\s*position\(\)\s*\}, \[open, position\]\)/u
    assert.ok(!passive.test(code),
      '不得再有一条同形的 useEffect 定位 —— 被动效果就是那个「闪现」的来源')
  })

  it('point 不得在渲染判据里「先信旧值」（要么首帧即正确，要么不渲染）', () => {
    // 渲染判据是 `open && point !== null`：由于上面已确保定位发生在**绘制前**，
    // 这一条只需钉住「判据没被改成别的写法」——例如改成 `open && point !== null ? ... :`
    // 之外的花样，或者引入一个「上次位置」的 ref 让首帧继续用旧值。
    assert.match(source, /open && point !== null/u, '面板渲染判据应是 open && point !== null')
    // 不得引入缓存旧坐标的 ref 来渲染（那正是这个 bug 的另一种写法）。
    assert.ok(!/pointRef|lastPoint|prevPoint/u.test(source.replace(/\/\*[\s\S]*?\*\//gu, '')),
      '不得缓存「上一次坐标」用于首帧渲染（会重新引入旧位置闪现）')
  })
})
