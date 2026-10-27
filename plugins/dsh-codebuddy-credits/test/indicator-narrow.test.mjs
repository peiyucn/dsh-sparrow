// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { MARK_COLLAPSE_PX, MARK_FONT_PX } from '../lib/constants.js'
import { buildIndicatorCss } from '../lib/client/styles.js'

/**
 * 顶栏 CodeBuddy 标记的**窄化契约**：组件结构读源码、CSS 读 styles.ts 的构建函数
 * （本插件无 client DOM 测试环境）。
 */
const SOURCE = new URL('../src/client/CodeBuddyCreditsIndicator.tsx', import.meta.url)
const HERO_SOURCE = new URL('../src/client/hero.tsx', import.meta.url)
const PANEL_SOURCE = new URL('../src/client/credits-panel.tsx', import.meta.url)
const source = await readFile(SOURCE, 'utf8')
const heroSource = await readFile(HERO_SOURCE, 'utf8')
const panelSource = await readFile(PANEL_SOURCE, 'utf8')
const styles = buildIndicatorCss()

function svgConst(name) {
  const line = source.split(/\r?\n/u).find(l => l.includes(`const ${name} =`))
  assert.ok(line, `找不到 SVG 常量 ${name}`)
  const start = line.indexOf("'")
  const end = line.lastIndexOf("'")
  assert.ok(end > start, `${name} 的字符串字面量没闭合`)
  return line.slice(start + 1, end)
}

describe('CodeBuddy 顶栏标记：窄化（容器查询）', () => {
  it('两个形态 应该 都渲染（少一个 ⇒ 切过去是空白）', () => {
    assert.match(source, /className=\{CCB_CLASS\.markWide\}/u, '缺少宽档 span（CCB_CLASS.markWide）')
    assert.match(source, /className=\{CCB_CLASS\.markNarrow\}/u, '缺少窄档 span（CCB_CLASS.markNarrow）')
    // 必须注入**逐注入点作用域化**后的 svg（mark-ids.ts 的 scopeMarkSvg）：同文档多份标
    // 若共用写死的渐变 id，不可见那份先被解析 ⇒ 渐变方底不画（浅色下像「logo 没反色」）。
    const trig = source.slice(source.indexOf('const triggerButton'), source.indexOf('const trigger ='))
    assert.match(trig, /__html:\s*markWideSvg/u, '宽档必须渲染作用域化后的 LOGO_SVG（带字样）')
    assert.match(trig, /__html:\s*markNarrowSvg/u, '窄档必须渲染作用域化后的 MARK_SQUARE_SVG（无文字方标）')
    assert.ok(!/__html:\s*(LOGO_SVG|MARK_SQUARE_SVG)\b/u.test(source),
      '不得直接注入未作用域化的原始 SVG 常量（多份同 id ⇒ 渐变解析到不可见定义 ⇒ 浅色下不出图）')
  })

  it('⛔ JSX 里 不得 给两个形态写内联 display —— 会压死 @container 的 display:none', () => {
    // React 的 style 是**内联**声明，优先级高于样式表 ⇒ 给这两个 span 写 display 会让
    // @container 里的 display:none 永远不生效（阈值到了、模式却不切）。
    const trig = source.slice(source.indexOf('const triggerButton'), source.indexOf('const trigger ='))
    /** @type {Array<[string, RegExp]>} */
    const patterns = [
      ['宽档', /CCB_CLASS\.markWide[\s\S]{0,200}?\}\}/u],
      ['窄档', /CCB_CLASS\.markNarrow[\s\S]{0,200}?\}\}/u],
    ]
    for (const [name, re] of patterns) {
      const block = re.exec(trig)
      assert.ok(block, `没取到${name} span`)
      assert.ok(!/display\s*:/u.test(block[0]),
        `${name} span 的 style 里不得出现 display（内联会压死容器查询）：${block[0]}`)
    }
  })

  it('机制 必须是 @container，且锚在**匿名**容器上（对齐官方 team 按钮）', () => {
    assert.ok(styles.includes(`@container (max-width: ${MARK_COLLAPSE_PX}px)`),
      '必须用容器查询、阈值取 MARK_COLLAPSE_PX（与官方 TeamAction 同款机制）')
    // 匿名容器：不得写 container-name（官方 .titleRow 是匿名的，写名字会解析不到）。
    assert.ok(!/container-name/u.test(styles), '不得给容器起名（官方 .titleRow 是匿名容器）')
    // 不得退回 ResizeObserver 式的 JS 监听；断言前必须**剥注释**，否则会命中本文件注释里的同名字样。
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    const afterTrigger = code.slice(code.indexOf('const triggerButton'))
    assert.ok(!/ResizeObserver/u.test(afterTrigger),
      '窄化不得靠 ResizeObserver（纯 CSS 就够，且不会有布局抖动）')
    assert.match(styles, /\.ccb-mark-wide \{ display: inline-flex; \}/u, '样式表要给宽档默认 display')
    assert.match(styles, /\.ccb-mark-narrow \{ display: none; \}/u, '样式表要给窄档默认 display:none')
  })

  it('窄档应该 顺带收内边距（方标是方形，8px 占比偏大）', () => {
    // 方标是方形，8px 内边距占比偏大 ⇒ 窄档收到 5px。
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
    const wide = svgConst('LOGO_SVG')
    assert.match(wide, /viewBox="0 0 90 24"/u, '宽档应是 90×24 的横排 lockup')
    assert.match(wide, /<g transform/u, '宽档必须含文字组（带字样）')
    const corner = (svg) => /<path d="(M18\.821 0H5\.18[^"]*)"/u.exec(svg)?.[1]
    assert.ok(corner(square) !== undefined, '方标里找不到圆角方块那段 path')
    assert.equal(corner(square), corner(wide), '两个形态的方块必须是同一段 path（切换时视觉连续）')
  })

  it('⛔ 每个品牌标注入点 必须 用**各自不同**的作用域前缀（同前缀 = 同 id，症状复发）', () => {
    // 机制：`fill="url(#id)"` 按**文档序第一个**同名元素解析，`display:none` 那份会被先取到 ⇒
    // 同前缀 = 同 id = 渐变方底不画（面板与顶栏窄档同用 MARK_SQUARE_SVG，尤其要分开）。
    const scopes = [...source.matchAll(/scopeMarkSvg\(\s*([A-Z_]+)\s*,\s*`ccb-logo-\$\{markScope\}([^`]*)`/gu)]
      .map(m => [m[1], m[2]])
    assert.equal(scopes.length, 3,
      `应有 3 处作用域化注入（宽档 lockup / 窄档方标 / 面板方标），实际 ${scopes.length} 处：${JSON.stringify(scopes)}`)
    const prefixes = scopes.map(([, prefix]) => prefix)
    assert.equal(new Set(prefixes).size, prefixes.length,
      `三个注入点的前缀必须互不相同（同前缀 = 同 id = 症状复发），实际 ${JSON.stringify(prefixes)}`)
    assert.deepEqual(scopes.map(([name]) => name).sort(), ['LOGO_SVG', 'MARK_SQUARE_SVG', 'MARK_SQUARE_SVG'],
      `作用域化应只围绕这两枚真值常量，实际 ${JSON.stringify(scopes)}`)
    const squarePrefixes = scopes.filter(([name]) => name === 'MARK_SQUARE_SVG').map(([, prefix]) => prefix)
    assert.equal(squarePrefixes.length, 2, '方标应有两个注入点（顶栏窄档 + 面板标题行）')
    assert.notEqual(squarePrefixes[0], squarePrefixes[1],
      '顶栏窄档与面板标题行都用 MARK_SQUARE_SVG，两者前缀必须不同（否则同 id，宽档下渐变又解析到隐藏那份）')
    assert.match(source, /import \{ scopeMarkSvg \} from '\.\/mark-ids\.js'/u,
      '必须 import scopeMarkSvg（纯函数与用途分离，便于单测）')
  })

  it('阈值 / 字号 应该 来自 constants 单一真值，且两个形态共用一个数', () => {
    // 阈值须落在「≥656 不重叠 / ≤616 起被压」这条缝里：低于 616 会漏掉已被压的档，过高则过早丢字样。
    assert.ok(MARK_COLLAPSE_PX >= 616 && MARK_COLLAPSE_PX <= 700,
      `阈值应在实测定出的 616..700 之间，实际 ${MARK_COLLAPSE_PX}`)
    assert.equal(MARK_COLLAPSE_PX, 656, '阈值锁定为实测定值 656（改它必须重跑量测）')
    assert.equal(MARK_FONT_PX, 18, '顶栏品牌标字号锁定为 18px')
    // 两个 span 都从同一个常量取字号；样式表不再写死商标字号。
    const occurrences = [...source.matchAll(/fontSize: MARK_FONT_PX/gu)]
    assert.equal(occurrences.length, 2, '宽档与窄档都应从 MARK_FONT_PX 取字号')
    assert.ok(!/ccb-mark-(?:wide|narrow)\s*\{[^}]*font-size/u.test(styles),
      '商标字号由 MARK_FONT_PX 一处给出，样式表不得写死')
  })

  it('⛔ hero 入口的 portal 容器 必须 落在 @container 上下文内（否则窄化恒不命中）', () => {
    // 容器查询只对**有容器祖先**的元素生效，官方 container-type 挂在 .titleRow（会话根的后代）
    // ⇒ portal 到 hero.rootEl 没有容器祖先，窄化恒不命中；必须经 heroPortalTarget 落到 .titleRow。
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    assert.ok(!/createPortal\(trigger,\s*hero\.rootEl\s*\)/u.test(code),
      'hero 入口不得直接 portal 到会话根 —— 那里没有 @container 上下文，窄化恒不命中')
    assert.match(code, /createPortal\(trigger,\s*heroPortalTarget\(hero\.rootEl\)\)/u,
      'hero 入口必须 portal 到 heroPortalTarget(hero.rootEl)')
    // 解析器必须**限定在本会话根内**找角按钮：多会话根并存时 document.querySelector 会取错树。
    const heroCode = heroSource.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    const fn = /function heroPortalTarget[\s\S]*?\n\}/u.exec(heroCode)
    assert.ok(fn, '找不到 heroPortalTarget 的定义')
    assert.match(fn[0], /rootEl\.querySelector\(HEADER_CORNER_SELECTOR\)/u,
      'heroPortalTarget 必须在传入的会话根内找角按钮（不得用 document.querySelector）')
    assert.match(fn[0], /\?\?\s*rootEl/u,
      '角按钮取不到时必须退回会话根（良性降级成原行为，不抛错）')
  })
})

describe('CodeBuddy 顶栏标记：面板不得先在旧位置画一帧', () => {
  /** 面板不得先在旧位置画一帧：定位放被动 `useEffect` 时首帧已按旧坐标画出。 */
  it('打开时的定位 必须用 useLayoutEffect（被动效果会先画一帧旧坐标）', () => {
    // 先剥注释再断言，否则注释里提到的 useLayoutEffect 会把断言喂饱。定位 hook 在面板模块里。
    const code = panelSource.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    const layoutCall = /useLayoutEffect\(\(\) => \{\s*if \(!open\) return\s*position\(\)\s*\}, \[open, position\]\)/u
    assert.match(code, layoutCall,
      '「打开时定位」必须放在 useLayoutEffect 里（否则会先在旧坐标画一帧）')
    const passive = /useEffect\(\(\) => \{\s*if \(!open\) return\s*position\(\)\s*\}, \[open, position\]\)/u
    assert.ok(!passive.test(code),
      '不得再有一条同形的 useEffect 定位 —— 被动效果就是那个「闪现」的来源')
  })

  it('point 不得在渲染判据里「先信旧值」（要么首帧即正确，要么不渲染）', () => {
    // 只需钉住判据不被改写（上一条已确保绘制前定位），如不得用「上次位置」的 ref 供首帧渲染。
    assert.match(source, /open && point !== null/u, '面板渲染判据应是 open && point !== null')
    const all = source + panelSource + heroSource
    assert.ok(!/pointRef|lastPoint|prevPoint/u.test(all.replace(/\/\*[\s\S]*?\*\//gu, '')),
      '不得缓存「上一次坐标」用于首帧渲染（会重新引入旧位置闪现）')
  })
})
