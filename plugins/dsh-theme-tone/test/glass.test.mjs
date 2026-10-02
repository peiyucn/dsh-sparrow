import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GLASS_BLUR,
  GLASS_CARD_ALPHA,
  GLASS_CARD_BLUR,
  GLASS_CARD_LIFT,
  GLASS_CARD_PHASES,
  GLASS_EDGE_LEFT,
  GLASS_EDGE_TOP,
  GLASS_HEADER_ALPHA,
  GLASS_SHADE_RING,
  GLASS_SPECULAR_RING,
  HEADER_HEIGHT_PX,
  HEADER_LIGHT_SCALE,
  PANEL_BAND_PX,
  PANEL_SCROLLER_LIFT_PX,
  SEAT_SOLID_PX,
  SEAT_SOLID_RAMP_PX,
  SHADE_ALPHA,
  buildGlassCss,
  buildSeamCss,
  CARD_NOTCH_RADIUS,
  CARD_NOTCH_WIDTH,
  phaseGate,
} from '../lib/glass.js'
/** 浅色轴暗边用的官方最深静态色 token。 */
const SHADE_TOKEN = '--dsw-static-neutral-bluish-1000'
import { ABOVE_CONTENT_Z_INDEX, CONTENT_Z_INDEX, GRAIN_ALPHA_VARIABLE, GRAIN_TILE_VARIABLE, PLAIN_ATTR, RIGHT_PANEL_ATTR, SIDE_ATTR, WIDTH_HANDLE_ATTR, WORKSTART_ATTR } from '../lib/constants.js'
import { BACKDROP_GRADIENTS, GRAIN_DATA_URI, GRAIN_OPACITY, GRAIN_OPACITY_LIGHT, dimmedBackdropGradients } from '../lib/backdrop.js'

const css = buildGlassCss()
// 注释里也会出现 `{` 这类结构字符，对全文做结构断言会误判，故先剥注释。
const rules = css.replace(/\/\*[\s\S]*?\*\//gu, '')

/**
 * 取**右边栏那条图层规则**的起点（已剥注释）。
 *
 * ⚠️ 0.1.7 起这条规则是**三条选择器共用同一段声明**：
 * `[data-sidebar-right-panel], [data-dockkit-pane], [data-dockkit-empty]` ——
 * 因为右边栏改由 dockkit 承载，真正刷不透明底色的是它的内容宿主
 * `[data-dockkit-pane]`（画在 `.panel` 上会被那层整个盖掉）。
 *
 * ⚠️ 2026-09-29 起面板那条**必须门在「已展开」上**（owner 报「右边栏打开过一次，背景就花了」）：
 * 官方面板是常驻元素，收起时宽度仍是持久化的 --dsh-sidebar-width、盒子照旧可见，
 * 我们那片 100vw×100vh 渐变就会以 screen 压在会话区右侧。故选择器写成
 * `[data-sidebar-right-panel][data-sidebar-right-open]`。
 * 定位仍用「属性名之后紧跟的字符」，不写死完整选择器。
 * @param source - 已剥注释的样式表文本。
 * @returns 该规则的起始下标（找不到为 -1）。
 */
function rightPanelRuleStart(source) {
  return source.indexOf(`[${RIGHT_PANEL_ATTR}][`)
}

/**
 * 取**输入框卡片**那条规则（已剥注释）。
 *
 * 必须剥注释：本模块的注释里会引用 `linear-gradient` / `background:` 这类**反面教材**
 * 做对比说明，直接对含注释的切片断言会误判（踩过一次）。
 * @param text - 完整样式表文本。
 * @returns 卡片规则的文本（选择器 + 声明块）。
 */
const cardRule = (text) => {
  const clean = text.replace(/\/\*[\s\S]*?\*\//gu, '')
  const start = clean.indexOf('[data-composer-card]')
  return clean.slice(start, clean.indexOf('}', start))
}

/**
 * 取所有**选择器里含 needle 的规则**（选择器 + 声明）—— 用大括号配平切规则。
 *
 * ⚠️ 2026-09-24 起卡片/顶栏的玻璃搬到了 `::before` 上，`cardRule` 那种
 * 「从选择器切到第一个 `}`」的取法只能拿到**本体**那一条；要断言玻璃本体得用本函数。
 * @param text - 样式表文本（注释会被剥掉）。
 * @param needle - 选择器片段。
 * @returns 命中规则的文本数组（每项含选择器与整段声明）。
 */
const rulesFor = (text, needle) => {
  const clean = text.replace(/\/\*[\s\S]*?\*\//gu, '')
  const out = []
  let i = 0
  while ((i = clean.indexOf(needle, i)) !== -1) {
    const open = clean.indexOf('{', i)
    if (open === -1) break
    let depth = 0
    let end = open
    for (; end < clean.length; end++) {
      if (clean[end] === '{') depth += 1
      else if (clean[end] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    out.push(clean.slice(clean.lastIndexOf('}', i) + 1, end + 1))
    i = end + 1
  }
  return out
}

/** 卡片**玻璃层**（`[data-composer-card]::before`）的全部规则。 */
const cardGlassRule = (text) => rulesFor(text, '[data-composer-card]::before').join('\n')

/**
 * 卡片玻璃层里那条**通用（深色轴）**规则 —— 光路形状的基准。
 *
 * 浅色轴那条只覆盖 `background-image`（阴影浓度不同），两条都被 `cardGlassRule` 收进来时
 * 椭圆数会翻倍，故几何类断言取通用那条。
 * @param text - 样式表文本。
 * @returns 通用玻璃层规则的文本。
 */
const cardGlassBaseRule = (text) =>
  rulesFor(text, '[data-composer-card]::before').find((r) => !r.includes(':not([data-ds-dark-theme])')) ?? ''

/** 卡片**本体**（不含 ::before / ::after 伪元素）的全部规则。 */
const cardElementRule = (text) =>
  rulesFor(text, '[data-composer-card]')
    .filter((r) => !/::before|::after/u.test(r.slice(0, r.indexOf('{'))))
    .join('\n')

// 玻璃效果依赖几个**公开 DOM 锚点**（官方自己的 CSS 也依赖它们）：
//   [data-phase] / [data-slot='conversation.header'] / [data-conversation-scroll] /
//   [data-composer-seat]
// 以及一个**魔法数字** 76px（顶栏高度）。这些耦合是这套效果最脆的地方，逐条钉住。
//
// ⚠️ 顶栏那条锚点在 0.1.7 换了（owner 真机报「顶栏崩了」的根因）：
//   0.1.5-rc.2 里 `conversation.session.header` 的产出物**直接是 .root 的子元素**，
//   故打 `> *` 命中它；0.1.7-rc.1 把它嵌进 `<header data-slot='conversation.header'>`，
//   而那个会话槽位自己是 display:contents —— `> *` 于是命中了官方的 .titleRow，
//   把标题行抽成绝对定位浮层、`<header>` 塌成 10px（实测 40px → 10px）。
//   现在的规则打**真正生成盒子的那个 `<header>`**，下面的回归守卫钉住这一点。
describe('glass：顶栏浮层', () => {
  it('三处改动应该 同时存在（少一个正文首行会被顶栏盖住）', () => {
    assert.match(css, /\[data-phase='active'\]\s*\{[^}]*position: relative/u, '① 需要定位祖先')
    assert.match(
      css,
      /\[data-slot='conversation\.header'\] > header[\s\S]*?position: absolute/u,
      '② 顶栏要浮起来（打在官方那个 <header> 上）',
    )
    // ③ 滚区顶部要补出顶栏高度 —— **必须是 padding-top，且滚动条由轨道 margin 单独下推**。
    //
    //    这条踩过两次，两个方向各自坏一半，必须一起看：
    //
    //    | 写法 | 正文能否滚到顶栏下（= 玻璃"透"） | 滚动条位置 |
    //    | :--- | :--- | :--- |
    //    | padding-top: 76            | ✅ 能（padding box 从 y=0 起） | ❌ 画进顶栏带（owner 报「滚动条跑上去」） |
    //    | border-top: 76             | ❌ **不能**（padding box 下移到 76，溢出裁剪线跟着到 76） | ✅ 在顶栏下方 |
    //    | padding-top + 轨道 margin  | ✅ 能 | ✅ 在顶栏下方 |
    //
    //    **border-top 是拿"玻璃的透"换"滚动条位置"**：模糊与 alpha 都还在，但顶栏底下
    //    什么都没有 ⇒ 玻璃退化成平板，owner 看到的就是「顶栏变成不透明了」。
    //    真机 A/B（滚动 0→1500，量顶栏带内像素变化；滑块染橙量顶端 y）：
    //      官方默认档                    顶栏带内有变化，滑块顶端 y=78（= 76 + 官方轨道 2px）
    //      padding-top: 76               31295 px ✅            滑块顶端 75 ✗
    //      border-top: 76                 971 px ❌ 顶栏下没东西  滑块顶端 78 ✓
    //      padding-top + 轨道 margin      31176 px ✅            滑块顶端 78 ✓
    assert.match(
      css,
      new RegExp(`\\[data-conversation-scroll\\]\\s*\\{[^}]*padding-top: ${HEADER_HEIGHT_PX}px`, 'u'),
      '③ 滚区顶部补出顶栏高度，且必须用 padding-top（border-top 会把溢出裁剪线一起下移，玻璃就"透"不出东西了）',
    )
    assert.ok(
      !/\[data-conversation-scroll\]\s*\{[^}]*border-top/u.test(rules),
      '⛔ 滚区不得用 border-top 顶开顶栏 —— 它下移 padding box，正文再也不能滚到顶栏下面，'
      + '玻璃看着变成不透明（owner 报过「顶栏变成不透明的了」）',
    )
    // 滚动条那半边**单独推**：轨道上边距 = 顶栏高 + 官方自己那 2px。
    // 用轨道 margin 而不是 border，是因为前者不动溢出裁剪线。
    assert.match(
      css,
      new RegExp(`\\[data-conversation-scroll\\]::-webkit-scrollbar-track\\s*\\{[^}]*`
        + `margin: calc\\(${HEADER_HEIGHT_PX}px \\+ 2px\\) 2px 2px`, 'u'),
      '③b 轨道要单独下推到顶栏下缘（值 = 顶栏高 + 官方轨道 2px，四值只改上边距）',
    )
    assert.ok(
      !/\[data-conversation-scroll\]\s*\{[^}]*box-sizing/u.test(rules),
      '不再需要 content-box（那是给 border-top 配对用的；改回 padding-top 后是多余声明）',
    )
  })

  it('⛔ 顶栏不许再打 `conversation.session.header` 的子元素（0.1.7 起会打崩官方顶栏）', () => {
    // 回归守卫：0.1.7-rc.1 里该槽位是 display:contents、其子元素是官方 .titleRow，
    // 绝对定位它会让 <header> 塌成 10px（实测 40 → 10），顶栏整条崩掉。
    assert.ok(
      !/data-slot='conversation\.session\.header'\]\s*>\s*\*/u.test(css),
      '顶栏规则不得再打 conversation.session.header 的直接子元素',
    )
  })

  it('顶栏高度应该 与官方契约一致（76 = 左栏 tab strip 38 + 面板标题 38）', () => {
    // 官方 ConversationRoot.module.css:37-41 把顶栏钉在 76px 上，好让它的 border-bottom
    // 与左栏那两行的分隔线在列边缘接上。这个数字变了要连带复核对齐。
    assert.equal(HEADER_HEIGHT_PX, 76)
    assert.equal(HEADER_HEIGHT_PX, 38 + 38)
  })

  it('顶栏应该 半透明 + 真模糊，且 z-index **高于用户内容层**、低于菜单', () => {
    assert.ok(css.includes(GLASS_BLUR), '要用同一套 blur 参数')
    assert.match(css, new RegExp(`color-mix\\(in srgb, var\\(--dsw-alias-bg-base\\) ${GLASS_HEADER_ALPHA * 100}%, transparent\\)`, 'u'))
    // 顶栏必须高于「用户内容层」（CONTENT_Z_INDEX）：内容层是正 z-index 的定位元素，
    // 会盖掉一切更小的层。曾经这里是 9（只想着高于拖拽条 8），内容层抬到 81 后
    // 顶栏就被内容盖住了（owner 真机反馈「顶栏盖不住对话内容了」）。
    assert.match(css, new RegExp(`z-index: ${ABOVE_CONTENT_Z_INDEX};`, 'u'), '应取 ABOVE_CONTENT_Z_INDEX')
    assert.ok(
      ABOVE_CONTENT_Z_INDEX > CONTENT_Z_INDEX && ABOVE_CONTENT_Z_INDEX < 100,
      '应高于内容层（81）且低于菜单（100）',
    )
  })

  it('⛔ 顶栏**不得**抬到右栏面板之上 —— 与面板同档（82）靠 DOM 次序决胜才是官方次序', () => {
    // owner 报「顶栏的后台任务弹窗被右侧栏压住」。实测（1600x900，真实实例）结论分两半：
    //
    // ① **可见的那半是官方裁切缺陷，不是层序**。中列 `centerCol` / `data-phase` 都是
    //    `overflow: hidden`，裁切右边界 **逐像素等于**面板左缘（实测 centerCol 右缘 880
    //    = 面板左缘 880）；弹窗向右伸出的部分全被裁掉。**官方默认档下同样裁**
    //    （theme off 复现）。
    //    ✅ **2026-10-02 已修**（owner 复报「还是没有修好」后重查）：修法是把弹框的
    //    **包含块**换成顶栏 / 会话根并夹进列内，**不碰列几何、也不碰任何 z-index** ——
    //    见 `src/popover.ts` 与 `test/popover.test.mjs`。它属于「修官方无意的 bug」
    //    那一类，两个档都修（见 docs/private-seams.md §B 第 4 条）。
    // ② **我们这半不能改**：把顶栏抬到 83 会**违反官方次序**：
    //    官方面板全屏时 `--dsh-dockkit-dock-layer: 40`（SidebarRight.module.css:64-66）
    //    本来就高于顶栏的 9 ⇒ 全屏面板必须压住顶栏。实测抬到 83：整块像素
    //    mean 2.47 / 17.3% 变化（顶栏浮到全屏文件面板之上，实测最深点 Δ235）。
    //    带「全屏时降回 82」的门虽然 push+全屏都零回归，但仍有第三处风险：
    //    dockkit **浮窗**（`--dsh-dockkit-float-layer: 60`，官方原序 浮窗 60 > 顶栏 9，
    //    浮窗拖到顶栏区时该赢）在本插件下面板已被抬成层叠上下文 ⇒ 顶栏 83 会反过来压住它。
    //    ⚠️ 而**抬高弹框自己的 z-index 是无效的** —— 它长在顶栏那层层叠上下文里，
    //    那个 100 对外只算 82，出不去（这正是 ① 后半段的成因）。
    // 故本用例把「同档 + 菜单仍严格高于面板」钉住，防止将来有人顺手把顶栏抬上去。
    const headerZ = [...css.matchAll(/\[data-slot='conversation\.header'\] > header \{[^}]*?z-index: (\d+);/gu)].map(m => Number(m[1]))
    assert.ok(headerZ.length > 0, '应能找到顶栏那条 z-index')
    for (const z of headerZ) {
      assert.equal(z, ABOVE_CONTENT_Z_INDEX, `顶栏必须与面板同档（${ABOVE_CONTENT_Z_INDEX}），实际 ${z}`)
    }
    // 并且整表里不得出现把顶栏抬到面板之上的第三条规则
    assert.ok(
      !new RegExp(`conversation\\.header[^{]*\\{[^}]*?z-index: (?:8[3-9]|9\\d|[1-9]\\d{2,});`, 'u').test(rules),
      '不得给顶栏写高于面板的 z-index（全屏面板与 dockkit 浮窗都必须能压住顶栏）',
    )
  })

  it('顶栏应该 **自己画一遍背景层的渐变栈**，且光与填充各自独立定强度', () => {
    // 背景层（80）原本压在顶栏之上，顶光是**直接盖在顶栏上**的；顶栏为躲开内容抬到 82 后
    // 就吃不到了（owner：「怎么顶栏的金光没有了」）。所以要自己画一遍，且必须**同源**。
    // ⚠️ **2026-09-27：光不再跟着填充 alpha 一起压**（owner：「顶部的光被顶栏挡住了」）。
    // 实测光一直没丢（重画忠实度 A/G = 0.98）——问题是底色 α0.7 把那条带整体压暗 26%，
    // 观感成了一条暗带。改为光 ×HEADER_LIGHT_SCALE(=1.0)：台阶 5.15 → 3.44（仍是顶栏略暗），
    // 顶栏内的光贡献 +42%。
    // 锚点用 0.1.7 起的那条（conversation.header > header）—— 见本文件顶部的结构对照。
    // ⚠️ 2026-09-24 起玻璃挂 **::before**（本体不许带 backdrop-filter，见下面那条守护）。
    const header = rulesFor(css, "[data-slot='conversation.header'] > header::before").join('\n')
    assert.ok(header.length > 0, '顶栏玻璃层（::before）应存在')
    assert.ok(
      header.includes(dimmedBackdropGradients(HEADER_LIGHT_SCALE)),
      '顶栏的光必须按 HEADER_LIGHT_SCALE 画（不再跟填充 alpha 同步压）',
    )
    // 光与底色分离之后，这条不变式要守住：两者**不得**再相等 ——
    // 相等的旧做法正是 owner 报的「光被顶栏挡住」。
    assert.notEqual(
      HEADER_LIGHT_SCALE,
      GLASS_HEADER_ALPHA,
      '光的比例必须与填充 alpha 分开（相等即退回「顶栏整体偏暗、光被挡住」）',
    )
    assert.match(header, /background-attachment: fixed/u, '必须 fixed —— 否则 76px 高的盒子会把渐变重新缩放成硬边带')
    assert.match(header, /background-color: color-mix/u, '玻璃填充仍在（背景色与渐变分层）')
  })

  it('⛔ 顶栏本体与卡片本体**都不得**带 backdrop-filter —— 会把官方弹层的模糊关进子树', () => {
    // owner 2026-09-24 真机报「弹层全透明 / 分区标题带子串色 / 联想对话框全透明」的根因：
    // 带 backdrop-filter（非 none）的元素会成为**它后代的 backdrop root**，同时成为
    // position: fixed 后代的包含块。而官方弹层就渲染在顶栏 / 输入卡子树里
    //（官方 InputBar 用 closest('[data-composer-card]') 给触发器菜单找锚，
    //  顶栏动作区的弹层锚点见 surface.ts 的 MENU_MATERIAL_ANCHORS）——
    // 于是弹层自己的 `backdrop-filter: var(--dsw-menu-backdrop-filter)`（官方 blur(40px)）
    // 只能采样子树，模糊失效，只剩半透明底色 → 看着就是「全透明 + 串色」。
    // 玻璃因此一律挂 ::before：伪元素没有后代，不会把官方弹层关进去。
    const headerElement = rulesFor(css, "[data-slot='conversation.header'] > header")
      .filter((r) => !/::before|::after/u.test(r.slice(0, r.indexOf('{'))))
      .join('\n')
    assert.ok(headerElement.length > 0, '顶栏本体规则应存在')
    assert.ok(!headerElement.includes('backdrop-filter'), '顶栏本体不得带 backdrop-filter（backdrop root）')
    const cardElement = cardElementRule(css)
    assert.ok(cardElement.length > 0, '卡片本体规则应存在')
    assert.ok(!cardElement.includes('backdrop-filter'), '卡片本体不得带 backdrop-filter（backdrop root）')
    // 而玻璃本身必须还在（只是换了挂载点）
    assert.ok(rulesFor(css, "[data-slot='conversation.header'] > header::before").join('').includes('backdrop-filter'))
    assert.ok(cardGlassRule(css).includes('backdrop-filter'))
  })

  it('⛔ 右边栏**不得**用 background-attachment: fixed —— transform 会让它静默改判定位区', () => {
    // owner 报的动态 bug：「右边栏，在弹出/收回过程中，上下亮度会骤增，静止时没事。」
    //
    // 根因（本机无头复现 + 白线探针实测）：**只要元素带非 none 的 transform，
    // fixed 的定位区就从「视口」变成「元素自己的盒子」**，百分比随之按元素盒解析。
    // 而官方 .panel 的开关动画恰是 transform（SidebarRight.module.css:36-47，
    // translateX(100%) ←→ none，0.3s）→ 动画期间 50% 从视口中心 640 跳到面板盒中心 190，
    // 顶光/底光灌进面板；动画结束 regime 翻回来 → 「骤增」。静止态没事，故截不到图。
    // ⚠️ transform: translateX(0px) 这种看着是空操作的值**同样触发**。
    //
    // 实测（面板几何完全相同，逐像素与「无面板」参照比对）：
    //   静止 + fixed + at 50% → mad 0.2（对）；动画 + fixed + at 50% → mad 26.4 / max 90（错）。
    const panel = rules.slice(rightPanelRuleStart(rules))
    const body = panel.slice(0, panel.indexOf('}') + 1)
    assert.ok(!/background-attachment:\s*fixed/u.test(body), 'fixed 在 transform 下会改判定位区')
    assert.match(body, /background-attachment: scroll;/u, '附着用 scroll（与元素盒一致，恒定）')
    assert.ok(body.includes(BACKDROP_GRADIENTS), '光仍与背景层同源')
  })

  it('右边栏改用「显式视口尺寸的背景盒」——三个 per-layer 属性都必须给足 3 个值', () => {
    // 替代方案：不用 fixed，而是把图片盒**显式**写成 100vw×100vh 并右对齐。
    // .panel 是 position:absolute; right:0，承载它的 frame 全窗宽 → 面板右缘恒等于视口右缘，
    // 于是该盒恰好覆盖视口，at 50% 落在视口中心；两种 transform regime 同解，没有可切换的东西。
    //
    // ⚠️ 三个 per-layer 属性（size / position / repeat）**都必须给足层数**：
    // 值少于层数时会**按顺序循环补齐**（本插件栽过 —— 写「scroll, fixed」等于两者交替，
    // 第 1、3 段渐变退回按元素盒解析）。所以这里逐个钉住。
    // 层数现在是 **3**（颗粒已改为独立的 ::after，不再占背景层 —— 见下一条用例）。
    const panel = rules.slice(rightPanelRuleStart(rules))
    const body = panel.slice(0, panel.indexOf('}') + 1)
    /**
     * 按**顶层逗号**切分值。
     * ⚠️ 不能直接 `split(',')`：值里可能含函数（如 `calc(0px - var(--x, 0px))`），
     * 括号内的逗号不是层分隔符 —— 直接切会把 3 层读成 6 层（本仓库实测踩过）。
     */
    const splitTopLevel = (value) => {
      const out = []
      let depth = 0
      let start = 0
      for (let i = 0; i < value.length; i++) {
        const ch = value[i]
        if (ch === '(') depth++
        else if (ch === ')') depth--
        else if (ch === ',' && depth === 0) { out.push(value.slice(start, i).trim()); start = i + 1 }
      }
      out.push(value.slice(start).trim())
      return out
    }
    const decl = (prop) => {
      const m = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'u'))
      assert.ok(m, `${prop} 缺失`)
      return splitTopLevel(m[1])
    }
    assert.equal(decl('background-size').length, 3, 'background-size 必须 3 个值（= 层数）')
    assert.equal(decl('background-position').length, 3, 'background-position 必须 3 个值（= 层数）')
    assert.equal(decl('background-repeat').length, 3, 'background-repeat 必须 3 个值（= 层数）')
    // 三段渐变的盒子尺寸必须是**显式视口尺寸**（auto 会让盒宽随 regime 变）
    assert.deepEqual(decl('background-size'), ['100vw 100vh', '100vw 100vh', '100vw 100vh'],
      '三段渐变必须显式 100vw 100vh')
    // 渐变右对齐（右缘 = 视口右缘），垂直方向**减去 caption 高度**
    // —— 桌面端（Windows 标题栏）面板被 caption 挤下，不减去就会与页面那层差 40px
    //    （owner 2026-09-30 报「桌面端右边栏展开后咱们也有点兼容问题」）。
    const expectedPos = 'right calc(0px - var(--dsh-windows-titlebar-height, 0px))'
    assert.deepEqual(decl('background-position'), [expectedPos, expectedPos, expectedPos],
      '三段渐变右对齐，且垂直相位按 caption 高度回正（web 下该变量不存在 ⇒ 0）')
    assert.deepEqual(decl('background-repeat'), ['no-repeat', 'no-repeat', 'no-repeat'])
  })

  it('桌面端 caption 相位：必须读官方变量并带 0 兜底（web 下逐像素不变）', () => {
    // 读**官方自己**的变量而不是自己探平台：preload-windows.ts 把它置在 html 上，
    // 沿继承树传给 body；web 下不存在 ⇒ fallback 0px，与改动前逐像素一致。
    // 这里钉住「fallback 是 0」这个前提 —— 若有人把兜底写成非 0，web 会当场偏色。
    const panel = rules.slice(rightPanelRuleStart(rules))
    const body = panel.slice(0, panel.indexOf('}') + 1)
    assert.match(body, /var\(--dsh-windows-titlebar-height,\s*0px\)/u,
      '必须读 --dsh-windows-titlebar-height 且兜底 0px（这是官方 preload 写的变量名）')
    // 不得为了桌面端另写一条 html 前缀规则绕开本表的「每条规则都要带门」纪律
    assert.ok(!/^html\[data-windows-titlebar\]/mu.test(rules),
      '不要新增 html 前缀的图层规则（应像本规则一样以 body 开头并自带门）')
  })
})

describe('glass：输入框底座', () => {
  it('底座本体不得自己画 —— 只撤掉官方那条实色渐隐带', () => {
    // 官方 .composerSeat 刷的是 linear-gradient(… bg-base 0px, bg-base 36px)：36px 以下**实色**。
    // 在本插件的色调背景上它读成一条纯色带，故撤掉（半透明的玻璃归**卡片**，见下一条）。
    assert.match(css, new RegExp(`\\[data-composer-seat\\]`, 'u'))
    assert.match(css, /background: none !important/u, '底座本体不画填充')
    assert.match(css, /backdrop-filter: none/u, '底座本体不模糊（玻璃归卡片）')
  })

  it('⛔ 底座上**不得**再挂覆盖整座的 ::before 夹层 —— 会糊到卡片两侧的留白上', () => {
    // owner 定案：「你这个透明，应该改变的是**输入框本身**，不是靠这个**夹层**吧……
    // 否则会有**误伤**啊。」（发现过程：「还有东西挡着，而且这个还会根据输入框变高一起变高」）
    //
    // 根因：`::before { inset: 0 }` 覆盖的是**整个底座**，而底座是**全宽**的
    // （卡片自己有 max-width，两侧留白）→ 那两条留白也被糊上一层 40% 填充 + 模糊。
    // 实测（owner 标注截图，排除蓝色标注像素）：周围颗粒能量 **2.87**，
    // 两侧留白被压到 **1.57 / 1.88** → 两块竖直暗矩形；又因 inset:0 跟着底座走，
    // **输入框一变高它就跟着变高**。
    //
    // 正确分法：玻璃归**卡片**（[data-composer-card]，形状天然等于卡片、不外溢）；
    // 底座**什么都不画**；只有「卡片下沿到座底」那一小条由 ::after 承担（挡正文）。
    assert.ok(
      !rules.includes('[data-composer-seat]::before'),
      '底座不得再有 ::before 夹层（inset:0 会覆盖全宽底座 → 卡片两侧留白被误伤）',
    )
    // 留白背后**没有正文**（正文列比卡片窄 32px），所以不画填充也不会露出内容。
    // ⚠️ 逐条取声明再判值：`background(-color)?:\s*(?!none)` 这种写法会从 `\s*` 回溯，
    // 把 `background: none` 也判成命中（踩过）。
    const seat = rules.slice(rules.indexOf("[data-phase='active'] [data-composer-seat] {"))
    const body = seat.slice(0, seat.indexOf('}') + 1)
    const decls = [...body.matchAll(/background(?:-color|-image)?\s*:\s*([^;]+);/gu)].map(m => m[1].trim())
    assert.ok(decls.length > 0, '底座应有 background 声明（撤掉官方的实色带）')
    assert.ok(
      decls.every(v => v.replace(/!important/u, '').trim() === 'none'),
      `底座本体的 background 只能全是 none，实际：${JSON.stringify(decls)}`,
    )
  })

  it('⛔ 底座上只许有 ::after 一个伪元素（且必须锚座底、很矮）', () => {
    const seat = rules.slice(rules.indexOf("[data-phase='active'] [data-composer-seat] {"))
    // 取到「输入框卡片」那条规则之前为止，这一段里的伪元素只该有 ::after
    const upto = seat.slice(0, seat.indexOf('[data-composer-card]'))
    const pseudos = upto.match(/::(?:before|after)/gu) ?? []
    assert.deepEqual(pseudos, ['::after'], `底座上只该有 ::after，实际：${JSON.stringify(pseudos)}`)
  })

  it('底座 ::after 必须是**很矮 + 不透明**，且按背景底部的样子重画', () => {
    // owner 定案：「下面这个块，应该是**很矮**才对，**就到输入框下面为止**，
    // 然后这个块是**不透明的**」「在这个基础上，**按照背景原来底部的样子重画**就对了」。
    //
    // 数学：设该点页面色 P = 底色 + L，面以 alpha a 画 C，合成 a·C + (1−a)·P。
    // 要让它恒等于周围就必须 C = P：
    //   * 不透明（a = 1）⇒ 原样画满 P 即可，**没有可调错的比例** ✓
    //   * 半透明 ⇒ 得画 a·P（底色与光**都**乘 a）；漏乘光就是「两层光」。
    // 所以「不透明」不是妥协，而是让等式**精确成立**的取法。
    const seat = rules.slice(rules.indexOf("[data-phase='active'] [data-composer-seat] {"))
    const after = seat.slice(seat.indexOf('::after'))
    const body = after.slice(0, after.indexOf('}') + 1)
    // 很矮：锚座底、高度 = 实色带 + 过渡段，且**不碰卡片**（不声明 top）
    assert.match(body, /bottom: 0/u, '锚座底（不是座顶 —— 从顶往下量会顶掉卡片玻璃）')
    assert.match(body, new RegExp(`height: ${SEAT_SOLID_PX + SEAT_SOLID_RAMP_PX}px`, 'u'), '很矮：只到卡片下沿')
    assert.ok(!/\btop\s*:/u.test(body), '不得声明 top —— 那会往上长到卡片上')
    // 宽度必须**不**是全宽以外的值：它只该压住正文列，锚座底那一小条是整宽的没问题
    assert.match(body, /left: 0/u, '横向铺满（那一小条是全宽的无妨，高度已限死在卡片下沿）')
    // 不透明：底色是**原样** token（不是 color-mix 出来的半透明）
    assert.match(body, /background-color: var\(--dsw-alias-bg-base\)/u, '带体必须不透明')
    // 按背景底部的样子重画：同源的光 + 颗粒
    assert.ok(body.includes(`var(${GRAIN_TILE_VARIABLE}, none)`), '颗粒必须在（漏了它就是唯一「干净」的平块）')
    assert.ok(body.includes(BACKDROP_GRADIENTS), '光必须与背景层**同源**（直引，不复制数值）')
    // ⚠️ 单个 fixed：本规则 4 层 background-image，`scroll, fixed` 会被循环补齐成
    // scroll/fixed/scroll/fixed，第 1、3 段渐变退回按元素自身盒子解析。
    assert.match(body, /background-attachment: fixed;/u, '必须单个 fixed（覆盖全部 4 层）')
    assert.ok(!body.includes('scroll, fixed'), '不得写 scroll, fixed（层数不足会被循环补齐）')
    // 遮盖强度（那条带子是**不透明**的，所以不留 !important 的必要，但也不该被官方简写压掉）
    assert.ok(!body.includes('backdrop-filter'), '不透带不模糊')
  })

  it('拖拽条只裁上段（恢复官方几何），且**不得**动它的指针基准', () => {
    // owner 2026-09-24：「左右边宽度拖动条**在顶栏依然穿模**」—— 顶栏浮层化的副作用：
    // 官方 .widthHandle 是 .body 里的 absolute + top:0/bottom:0，官方顶栏在流内占 76px，
    // 所以光带只在顶栏下缘以下；本插件把顶栏改成浮层后 .body 从 0 起，那截就透过半透明顶栏显出来。
    // ✅ 现在的做法 = 把盒子**还原成官方那一份**（[76,720]），几何基准与官方完全一致。
    // ⛔ 仍然**不许**碰 `--dsh-width-handle-pointer-y`：官方那套 calc(var(...) ± 36px) 必须
    //    继续按盒子解析，hover / 拖拽时写真实 clientY 的是官方与 nav-pin（不是本插件）。
    const handleRules = rulesFor(css, `[${WIDTH_HANDLE_ATTR}]`).filter((r) => r.includes('top:'))
    assert.equal(handleRules.length, 1, `应恰好有一条拖拽条裁切规则，实际 ${handleRules.length}`)
    const clip = handleRules[0]
    const body = clip.slice(clip.indexOf('{') + 1, clip.lastIndexOf('}'))
    assert.match(body, /top: 76px/u, '只裁上段：top 取官方顶栏高度')
    assert.ok(!body.includes('--dsh-width-handle-pointer-y'), '不得改写官方指针变量（那是 nav-pin 的职责）')
    assert.ok(!/height|bottom/u.test(body), '不动高度/下缘 —— 只把上段让给顶栏')
    // 只在「顶栏被浮层化」的那个状态出现：色调档 + active 相位
    const selector = clip.slice(0, clip.indexOf('{'))
    assert.match(selector, new RegExp(`:not\\(\\[${PLAIN_ATTR}\\]\\)`, 'u'), '必须带官方默认门')
    assert.match(selector, /\[data-phase='active'\]/u, '必须限定 active 相位（hero 下官方顶栏就在流内）')
    // ⚠️ backdrop.ts 里另有一条 `[data-width-handle] { z-index: 82 }`：只抬层级，不动几何，合法。
  })

  it('不得给底座写 position —— 本选择器 (0,3,1) 比官方 (0,3,0) 高，写了就会顶掉 sticky', () => {
    // 回归守卫：曾经在这写 `position: relative` 当「兜底定位上下文」，注释以为
    // 「sticky 已是定位元素、这行不生效」—— 实际本选择器是 (0,3,1)，元素计数多一个，
    // **压过**官方的 (0,3,0)，底座从 sticky 变成 relative，于是**输入框跟着内容滚走了**
    // （owner 真机反馈：「对话框现在跟着页面滚动了，应该是固定了，好像搞坏了」）。
    // 底座官方本来就是 sticky（定位元素），::before 的包含块已经成立，无需兜底。
    // 用**剥过注释**的 `rules`：这条规则的注释里就写着「曾经写了 position: relative」，
    // 用带注释的原文会把说明文字本身当成声明。
    const seat = rules.slice(rules.indexOf('[data-phase=\'active\'] [data-composer-seat] {'))
    const body = seat.slice(0, seat.indexOf('}') + 1)
    assert.ok(
      !/position\s*:/u.test(body),
      '底座本体不得声明 position（(0,3,1) 会覆盖官方的 sticky）；包含块由官方自己的 sticky 提供',
    )
  })

  it('mask 只能加在伪元素上 —— 加在底座上会连卡片一起淡化', () => {    // 卡片是底座的子元素；mask 作用于整个元素树，直接给底座加 mask 会把输入框卡片也擦掉。
    const seatBody = css.slice(css.indexOf('[data-phase=\'active\'] [data-composer-seat] {'))
    const body = seatBody.slice(seatBody.indexOf('{'), seatBody.indexOf('}'))
    assert.ok(!body.includes('mask-image'), '底座本体不得带 mask（会连子元素一起淡）')
  })
})

describe('glass：输入框卡片本身（用户盯着的那个面）', () => {
  it('卡片必须自己是玻璃 —— 底座已不画，卡片是唯一的玻璃面', () => {
    // 数据锚点来自官方 InputBar.tsx:429 的 data-composer-card
    assert.match(css, /\[data-composer-seat\] \[data-composer-card\]/u)
    // ⚠️ 必须 round —— 直接 `0.58 * 100` 会得到 `57.99999999999999`，与 CSS 里的 `58%` 对不上
    // （实现侧的 `pct()` 是 `Math.round(alpha * 100)`，两边得用同一种取整）。
    assert.match(css, new RegExp(`${Math.round(GLASS_CARD_ALPHA * 100)}%, transparent`, 'u'))
    // 玻璃的**形状**必须等于卡片 —— 靠卡片自己那条 ::before 的 backdrop-filter
    //（不是底座上的夹层；2026-09-24 起也从卡片**本体**挪到伪元素，理由见上面的 backdrop root 守护）。
    const card = cardGlassRule(css)
    assert.match(card, /backdrop-filter/u, '卡片自己的玻璃层承担模糊（不是底座夹层、也不挂本体）')
    assert.match(card, /border-radius: inherit/u, '伪元素必须继承卡片的 22px 圆角，否则玻璃画成方角')
  })

  it('卡片的不透明度必须留出可辨的透出量（太高就等于实色，模糊看不见）', () => {
    // 早先底座上还压着一层 40% 填充，故当时按「合成不透明度」设上限；
    // 夹层撤掉后，**卡片这一层就是最终不透明度**，判据随之简化。
    assert.ok(GLASS_CARD_ALPHA <= 0.82, `卡片不透明度 ${(GLASS_CARD_ALPHA * 100).toFixed(0)}% 太高，玻璃看不出来`)
  })

  it('未选工作区（待启动态）应该 撤掉我们的边光，把边界让回官方虚线框', () => {
    // owner 2026-09-20：「点击选择工作区的页面，改成玻璃输入框后，它这个描边就有点不和谐了」
    //   → 定案 (a)：这个状态下撤我们的边光，官方的虚线框成为唯一边界。
    // 官方在那个状态**自己**把 --dsw-elevation-stroke-color 设成 transparent，
    // 即刻意让虚线成为唯一那道边；我们再叠镜面 + 暗壁就是两套边缘语言。
    const rule = new RegExp(
      `body:not\\(\\[${PLAIN_ATTR}\\]\\)\\[${WORKSTART_ATTR}\\][^{]*\\[data-composer-card\\]\\s*\\{([^}]*)\\}`,
      'u',
    ).exec(css)
    assert.ok(rule !== null, `缺待启动态的卡片规则（应带 [${WORKSTART_ATTR}] 标记）`)
    const body = rule[1]
    // 必须保留官方自己的抬升投影 —— 那是官方语义，不归我们撤。
    assert.match(body, /box-shadow:\s*var\(--dsw-elevation-soft\)/u, '应保留官方 --dsw-elevation-soft')
    // ⛔ 不得含我们的悬浮投影，也不得含任何 inset 边光（镜面 / 暗壁一律撤）。
    for (const line of GLASS_CARD_LIFT.split(',')) {
      assert.ok(!body.includes(line.trim()), `待启动态不得含我们的悬浮投影：${line.trim()}`)
    }
    assert.ok(!/inset/u.test(body), '待启动态不得含 inset 边光 —— 与官方虚线框并存就是两条边')
    // 玻璃本体（填充 / 模糊）**保留**：卡片仍是玻璃，只是边缘交给官方。
    assert.ok(!/backdrop-filter/u.test(body), '这条规则不该重复声明 backdrop-filter（上面那条已给）')
  })

  it('⛔ 待启动态规则必须**排在**卡片玻璃规则之后（同特异性靠后者胜出）', () => {
    const normal = css.indexOf('[data-composer-seat] [data-composer-card]')
    const workstart = css.indexOf(`[${WORKSTART_ATTR}]`)
    assert.ok(normal >= 0 && workstart >= 0, '两条规则都应存在')
    assert.ok(workstart > normal, '待启动态规则必须在卡片玻璃规则之后，否则覆盖不生效')
  })

  it('卡片应该 带**一圈镜面高光**（液态玻璃的「玻璃厚度」），且分主光方向', () => {
    // owner：「无论深色还是浅色模式，对话框能不能有苹果那种液态玻璃的质感？」
    //   → owner 澄清「对话框」= **打字那个输入框**（不是模态弹窗）；
    // 又说「液态玻璃效果好像不只是上面加亮条，你可以看看苹果的设计。」
    // Apple 的材质是 `specular highlights, refraction` —— 高光沿玻璃的**整圈边缘**、
    // 随主光方向强弱不同；四条等亮那是**塑料描边**，不是玻璃。
    // ⚠️ 2026-09-24：inset 环与玻璃同在 **::before**（放本体会被玻璃层埋掉 ——
    //   owner 报的「输入框玻璃效果改坏了，边缘光效和之前不同」就是它）。
    const card = cardGlassBaseRule(css)
    for (const { key } of GLASS_SPECULAR_RING) {
      assert.ok(card.includes('inset '), `卡片应有 ${key} 方向的 inset 阴影`)
    }
    const alphas = GLASS_SPECULAR_RING.map(e => e.alpha)
    assert.equal(new Set(alphas).size, alphas.length, '四条边亮度应各不相同（模拟主光来自左上）')
    assert.equal(alphas[0], Math.max(...alphas), '上边应最亮 —— 主光来自上方')
  })

  it('边光必须**沿边衰减**（不是均匀光条）—— 靠锚左上角的细长椭圆', () => {
    // owner 连问：「**左边是满光么？？**」「**上边应该也不是均匀的光条吧？**」。
    // `inset box-shadow` 每条边**天生均匀** —— 只能做「一圈等亮的壁」，
    // 做不出「光从左上方来、沿边衰减」。所以主光改用 `background-image` 的细长椭圆。
    // ⚠️ 2026-09-24 起这条 background-image 在**卡片的 ::before**（玻璃层）上；
    //    几何取通用那条（浅色轴只换阴影浓度、椭圆形状同源）。
    const card = cardGlassBaseRule(css)
    assert.match(card, /background-image:/u, '沿边衰减的光应写在 background-image 里')
    // 两条椭圆都锚在**左上角**（光源处），这样左上角最亮、向右向下各自衰减
    const anchored = card.match(/radial-gradient\([^;]*?at 0% 0%/gu) ?? []
    assert.equal(anchored.length, 2, '应有两条锚在左上角的椭圆（上缘一条、左缘一条）')
    // 上缘那条：横向长、纵向扁；左缘那条：纵向长、横向扁 —— **两个方向都要连续衰减**
    assert.ok(GLASS_EDGE_TOP.rx > 1 && GLASS_EDGE_TOP.ry < 0.2, '上缘椭圆应横向铺满、纵向很扁')
    assert.ok(GLASS_EDGE_LEFT.ry > 1 && GLASS_EDGE_LEFT.rx < 0.2, '左缘椭圆应纵向铺满、横向很扁')
    // **关键**：纵向半径不能是 0 —— 否则往内是硬边界（就退回「薄 / 锐利」那个毛病）
    assert.ok(GLASS_EDGE_TOP.ry > 0, '上缘必须往内有柔化带（否则又是一条硬边）')
    assert.ok(GLASS_EDGE_LEFT.rx > 0, '左缘必须往内有柔化带')
    // 生成的 CSS 不得含浮点噪声（`1.1 * 100` 会漏出 `110.00000000000001%`）
    assert.ok(!/\.\d{6,}%/u.test(card), `CSS 里有浮点噪声：${/[\d.]{6,}%/u.exec(card)?.[0]}`)
  })

  it('玻璃厚度必须落在**柔而不厚**的区间（四次反馈夹出来的）', () => {
    // owner **四次**反馈（三次同向、一次反向）把这条夹成了一个**区间**，不是单边下限：
    //   「这个玻璃**特别薄**，是不是光边有点**过于锐利**了？」→ 不能太锐（blur 要有）
    //   「**整体玻璃厚度的感觉稍微往回收一收，也有点弄大了**」→ 也不能太厚（blur 别过大）
    //   「把输入框的边缘光，**再稍微弄薄一点点**……**别收大了**」→ 再收一点，但仍在这个区间内
    //   「厚度感**稍微减低一点点**，**边缘高光还是有点厚了**」→ 再收一档（本轮）
    // 所以断言是双侧：**≥ 2px（不是描边）且 ≤ 3px（不成板）** —— 别再把区间改成单边。
    const byKey = Object.fromEntries(GLASS_SPECULAR_RING.map(e => [e.key, e]))
    for (const [key, edge] of Object.entries(byKey)) {
      assert.ok(edge.blur >= 2, `${key} 的柔度 ${edge.blur}px 太小 —— 锐利细线会显得玻璃很薄`)
      assert.ok(edge.blur <= 3, `${key} 的柔度 ${edge.blur}px 太大 —— 玻璃会显得过厚（owner 反馈过）`)
    }
    // 焦散最柔（它穿过整个玻璃体）
    assert.ok(byKey.bottom.blur >= byKey.top.blur, '下缘焦散应不弱于上缘的柔度')
    // 渐变层的**柔化带**（`ry`）也是厚度感来源：要窄（薄）但不能为 0（硬边）
    assert.ok(GLASS_EDGE_TOP.ry > 0, '上缘必须有往内的柔化带（为 0 就是硬边）')
    assert.ok(GLASS_EDGE_TOP.ry <= 0.05, `上缘柔化带 ${GLASS_EDGE_TOP.ry} 太宽 —— 玻璃会显得厚`)
    // ⚠️ **下界 0.03 是量出来的**（不是拍的）：本机无头复现逐像素量上缘亮度剖面 ——
    //   ry 0.040 → 可见厚度 4px；0.034 → 4px（只改了第 3 像素的亮度，肉眼看不出）；
    //   0.030 → **3px**（这一档才看得见变化）；0.020 → 2px（开始像描边）。
    // owner 第 ④ 轮说「**还是**有点厚」，根因就是 ③ 那步只改了 1px 的**亮度**而非**厚度**。
    assert.ok(
      GLASS_EDGE_TOP.ry >= 0.03,
      `上缘柔化带 ${GLASS_EDGE_TOP.ry} 低于 0.03 —— 可见带只剩 ≤2px，会读成描边（owner 第①轮否过）`,
    )
    // 衰减停止点要留出过渡带（不是硬停止）
    for (const [name, edge] of [['上缘', GLASS_EDGE_TOP], ['左缘', GLASS_EDGE_LEFT]]) {
      assert.ok(edge.stop >= 0.4 && edge.stop <= 0.9, `${name} 的衰减停止点 ${edge.stop} 应留出柔和过渡带`)
    }
  })

  it('⛔ 厚度只能靠**收宽度**表达，不许改用**压亮度**', () => {
    // owner 四次说的都是「**薄**」（宽度），不是「**淡**」（亮度）—— 第 ③ 轮已明确记过这条口径。
    // 压 alpha / 阴影浓度会让**光源方向**丢掉（左亮右暗不对称是「光从左上来」的全部证据），
    // 所以那两项在四轮调整里**一次都没动过**。将来要「再薄一点」仍旧只许动 ry / blur。
    assert.equal(GLASS_EDGE_TOP.alpha, 0.28, '上缘 α 不该被厚度调整牵动')
    assert.equal(GLASS_EDGE_LEFT.alpha, 0.12, '左缘 α 不该被厚度调整牵动')
    assert.deepEqual(SHADE_ALPHA, { light: 0.10, dark: 0.06 }, '阴影浓度属于「方向」不属于「厚度」')
  })

  it('边光必须**沿圆角绕圈**（inset 环负责底光）', () => {
    // owner 拿 iPhone 图指出：「**不太对呢，你看 iphone 这个**」。
    // 官方卡片是 `border-radius: 22px`（`InputBar.module.css:55`），
    // 而 `linear-gradient` 画的是**直线带** —— 到圆角处被裁断，**光绕不过圆角**。
    // `inset` 阴影沿元素自身的圆角轮廓走，天然绕圈 —— 现在它负责**一圈底光**
    // （右下角那一带靠它，椭圆到不了），主光则交给 background-image 的椭圆。
    // ⚠️ 2026-09-24：inset 环与玻璃同在 **::before** —— 放本体（背景/box-shadow 先画）
    //   会被后画的负 z-index 玻璃层整个埋掉，正是 owner 报的「边缘光效和之前不同了」。
    const card = cardGlassBaseRule(css)
    assert.match(card, /box-shadow:/u, '底光应写在 box-shadow 里')
    assert.ok(!/background-image:[^;]*linear-gradient/u.test(card), '直线带画不出圆角（不得用 linear-gradient 画边光）')
    const insets = card.match(/inset /gu) ?? []
    assert.equal(
      insets.length,
      GLASS_SPECULAR_RING.length + GLASS_SHADE_RING.length,
      `应有 ${GLASS_SPECULAR_RING.length} 条底光 + ${GLASS_SHADE_RING.length} 条阴影`,
    )
  })

  it('必须**保留官方的外投影**（不能只用 !important 盖掉）', () => {
    // 官方卡片自带 `box-shadow: var(--dsw-elevation-soft)`（`InputBar.module.css:57`，**外**投影）。
    // 我们的内阴影与它**可并存** —— 多条 box-shadow 逗号并列。用 `!important` 盖掉会把抬升感一起抹掉。
    const card = cardRule(css)
    assert.ok(card.includes('var(--dsw-elevation-soft)'), '官方外投影必须保留在我们的 inset 之前')
    assert.ok(!/box-shadow:[^;]*!important/u.test(card), '不该用 !important 覆盖 box-shadow')
  })

  it('光路必须符合「光从**左上方**来」：上/左是光、**右是阴影**、下是焦散', () => {
    // owner 点破根因：「**四个边都是光？iphone 那个右边是阴影，左边也不是满光。
    // 咱们还是要按实际场景模拟，咱们的光主要是从左上方打过来的**」。
    // 我连错三版的思维定势就是：**把四条边都当成「光」，只调亮度**。
    // 背光侧壁处在**自己的阴影**里 —— 它比背景**更暗**，那一侧不该有高光。
    //
    // ⚠️ **光现在分两层**：`background-image` 的椭圆是**主光**（上缘 + 左缘），
    // `inset` 环只是**底光**（上 / 下）。所以「左缘有光」要去**渐变层**里查，
    // 不能只查 ring（曾经把左缘从 ring 撤掉后，这条断言就误报了）。
    const shade = GLASS_SHADE_RING.map(e => e.key)
    const ringLits = GLASS_SPECULAR_RING.map(e => e.key)

    // ① 右缘绝不能有任何高光（它是阴影）
    assert.ok(!ringLits.includes('right'), '右缘不该在底光里')
    // ② 阴影**必须在右缘**（背对光源）
    assert.deepEqual(shade, ['right'], '阴影应在右缘（背光侧壁）')
    // ③ 左缘（迎光侧）不该有阴影
    assert.ok(!shade.includes('left'), '左缘是迎光侧，不该有阴影')
    // ④ 上缘与左缘都要有**主光** —— 在渐变层里（两条椭圆，都锚左上角）
    // ⚠️ 2026-09-24 起渐变层在卡片的 ::before（玻璃层）上；取通用那条。
    const card = cardGlassBaseRule(css)
    const ellipses = card.match(/radial-gradient\([^;]*?at 0% 0%/gu) ?? []
    assert.equal(ellipses.length, 2, '主光应有两条椭圆（上缘一条、左缘一条）')
    assert.ok(GLASS_EDGE_TOP.alpha > 0, '上缘应有主光')
    assert.ok(GLASS_EDGE_LEFT.alpha > 0, '左缘应有主光（斜射，比上缘弱）')
  })

  it('左缘必须**明显弱于**上缘，且很窄（否则会变成「左边那一块」）', () => {
    // owner：「**左边那块是不是有点过了……**」（附真机截图：一条约 40px 宽、从上亮到下的亮带）。
    // 第一版给 `rx 5% / α 26%` —— 横向半径 5% × 1320px = 66px，衰减后仍有 ~40px 宽，
    // 且左上角两层叠加到约 51% 白。物理上侧壁光只是「透过玻璃看到厚度」，应当**窄而暗**。
    // ① 渐变层：左缘不到上缘的六成
    assert.ok(
      GLASS_EDGE_LEFT.alpha < GLASS_EDGE_TOP.alpha * 0.6,
      `左缘 α=${GLASS_EDGE_LEFT.alpha} 应明显低于上缘 α=${GLASS_EDGE_TOP.alpha}（不超过六成）`,
    )
    // ② 渐变层：左缘必须**窄**（横向半径小），否则就是「左边那一块」
    assert.ok(GLASS_EDGE_LEFT.rx <= 0.03, `左缘横向半径 ${GLASS_EDGE_LEFT.rx} 太大 —— 会糊成一片`)
    // ③ **左缘不得再有 inset 底光** —— 与渐变层叠加会把收窄的左缘又拉宽回去
    assert.ok(
      !GLASS_SPECULAR_RING.some(e => e.key === 'left'),
      '左边只能由渐变层负责，不能在 inset 环里再写一条（叠加会变宽）',
    )
    // ④ 左上角两层叠加不能过亮（叠加公式：1−(1−a)(1−b)）
    const corner = 1 - (1 - GLASS_EDGE_TOP.alpha) * (1 - GLASS_EDGE_LEFT.alpha)
    assert.ok(corner <= 0.45, `左上角叠加亮度 ${(corner * 100).toFixed(0)}% 过亮 —— 会烧出一块白斑`)
  })

  it('不要照抄 iPhone 的**对称**（那是正上方光，我们是左上方）', () => {
    // owner：「**iphone那个我理解是从正上方打的光，咱们是左上方**」。
    // iPhone 的左右对称；我们必须左右**不对称**，否则光源方向就丢了。
    // 判据：**左侧有光（渐变层）而右侧是阴影** —— 两者角色不同就叫不对称。
    const shade = GLASS_SHADE_RING.map(e => e.key)
    assert.ok(GLASS_EDGE_LEFT.alpha > 0, '左缘有光（渐变层）')
    assert.ok(shade.includes('right'), '右缘是阴影')
    assert.ok(!shade.includes('left'), '左缘是迎光侧，不该有阴影')
    assert.ok(!GLASS_SPECULAR_RING.some(e => e.key === 'right'), '右缘不该在底光里 —— 否则与左缘对称了')
  })


  it('阴影侧应该 **两轴都有**（它属于光路，不是浅色轴的补丁）', () => {
    // 早先这里是「浅色轴的补丁」（因为近白面上白高光看不见）—— **那个定位是错的**。
    // 阴影侧与明暗轴无关：它是**光路**的产物（背光侧壁必然比背景暗）。
    // owner 的原始反馈确实是从浅色模式发现的（「浅色模式的输入框也得处理下」），
    // 但结论对两轴都成立 —— 差别只在**浓度**。
    assert.ok(GLASS_SHADE_RING.length >= 1, '应有阴影侧')
    for (const { key, alpha } of GLASS_SHADE_RING) {
      assert.ok(alpha > 0 && alpha < 0.2, `${key} 阴影应很轻（现 ${alpha}）—— 重了就是脏/描边`)
    }
    // ⚠️ **不得压上/左缘**：那是迎光侧（高光），上缘是直射、左缘是斜射，两者都是亮的。
    // 曾经在左缘压过暗边 —— 与新的亮壁厚**同位置一压一提、互相抵消**。
    assert.ok(!GLASS_SHADE_RING.some(e => ['top', 'left', 'bottom'].includes(e.key)),
      '阴影只该在右缘（背光侧）')
    // **两轴**都要有阴影（深色轴那条规则里也得出现深色 token）
    const darkStart = css.indexOf("]:not([data-ds-dark-theme])")
    const darkRule = css.slice(0, darkStart > 0 ? darkStart : css.length)
    assert.ok(darkRule.includes(SHADE_TOKEN), '深色轴（通用规则）也应带阴影侧')
    // 两轴浓度不同（深色底上更轻，否则发脏）
    assert.ok(SHADE_ALPHA.dark < SHADE_ALPHA.light, '深色轴的阴影应轻于浅色轴')
  })

  it('卡片填充必须用 longhand —— background 简写会重置其他背景层', () => {
    // 填充/模糊都在卡片的 ::before（玻璃层）上；**本体**另有一条「background-color: transparent」
    // 用来给官方那条不透明实色让位 —— 两处都只许 longhand。
    const glass = cardGlassRule(css)
    assert.match(glass, /background-color:/u, '填充应写成 background-color')
    assert.ok(!/\bbackground:/u.test(glass), '不得用 background 简写')
    assert.ok(glass.includes(`backdrop-filter: ${GLASS_CARD_BLUR}`), '玻璃层应带自己的模糊档')
    const element = cardElementRule(css)
    assert.ok(!/\bbackground:/u.test(element), '本体让位也不得用 background 简写')
    assert.match(element, /background-color: transparent/u, '本体必须让出底色（官方那条是不透明实色）')
  })

  it('模糊应该 收到「通透」那一档（太大 → 抹掉背后形状，像磨砂塑料而非玻璃）', () => {
    // owner：「**顶栏和输入框下面的模糊，有点太大了，会降低玻璃通透感，得往回收收**」。
    // 玻璃的「通透」来自**还能认出背后有东西在动** —— 大模糊只剩一团平均色。
    // 曾用 18px（chrome）/ 24px（卡片），后都收到 12px。
    const px = (s) => Number(/blur\((\d+(?:\.\d+)?)px\)/u.exec(s)?.[1])
    assert.ok(px(GLASS_BLUR) <= 14, `chrome 模糊 ${px(GLASS_BLUR)}px 偏大，会降低通透感`)
    assert.ok(px(GLASS_CARD_BLUR) <= 14, `卡片模糊 ${px(GLASS_CARD_BLUR)}px 偏大，会降低通透感`)
    // ⚠️ **卡片允许比顶栏更轻**（曾经要求两者严格相等，2026-09-18 放宽）：
    // 那条「同一块玻璃的两个部件」的顾虑不成立 —— 顶栏在**顶部**、输入框在**底部**，
    // 两者永不相邻，不存在「交界处露断层」的问题（真正相邻的是底座那条带子与卡片，
    // 它们在同一个视觉组里，那条约束另行守住）。
    // owner 明确只要**输入框**更通透：「让**输入框的**背透模糊再轻一点」——
    // 顶栏不在这次诉求里，故不动它。
    assert.ok(
      px(GLASS_CARD_BLUR) <= px(GLASS_BLUR),
      '卡片的模糊不得**重于**顶栏（通透是卡片的诉求；顶栏不在其中）',
    )
    // 卡片仍靠**提饱和**补回质感（不靠加大模糊）
    const sat = (s) => Number(/saturate\(([\d.]+)\)/u.exec(s)?.[1])
    assert.ok(sat(GLASS_CARD_BLUR) > sat(GLASS_BLUR), '卡片应比 chrome 更饱和（通透靠饱和补，不靠模糊）')
  })

  it('卡片必须带**悬浮投影** —— 官方那条只有 3% 黑，读不出抬升', () => {
    // owner：「输入框本身在背景上**增加一些悬浮感**，我理解是得加一些阴影吧？」—— 理解正确。
    // 官方 `--dsw-elevation-soft` 实测 ≈ `0 4px 16px #00000008`（**3% 黑**），
    // 在这套带色调光的背景上几乎不可见。
    const card = cardRule(css)
    // ① 必须**先是官方那条**：保留它的抬升语义（不能只用 !important 覆盖）
    assert.match(card, /box-shadow:\s*var\(--dsw-elevation-soft\)/u, '官方投影必须留着（并列，不替换）')
    // ② 我们的悬浮投影接在它后面
    assert.ok(card.includes(GLASS_CARD_LIFT), '缺悬浮投影')
    // ③ 且**不许**用 !important（那会连官方那条一起抹掉）
    assert.ok(!/box-shadow:[^;]*!important/u.test(card), '不得用 !important 覆盖 box-shadow')
  })

  it('悬浮投影应该 **只加深、不位移**，且不碰边光 —— 两者是两件事', () => {
    // 悬浮感靠**投影浓度**（黑度）与**柔化范围**，不靠把卡片挪位置。
    // 边光（GLASS_SPECULAR_RING 的 inset）是「玻璃厚度」，与悬浮是两回事，别混着调。
    assert.match(GLASS_CARD_LIFT, /rgba\(0,\s*0,\s*0/u, '悬浮投影应是黑色系')
    assert.ok(!/\binset\b/u.test(GLASS_CARD_LIFT), '悬浮投影是**外**投影，不得含 inset')
    // 影子往**下**落（y > 0）—— 这也正是它不会从半透明卡片的自己背后透出来的原因
    // （实测四档下卡片内部亮度恒为 80.1 不变，只有卡下缘变暗）。
    // ⚠️ x 偏移写作 `0`（无单位）是合法的，正则必须容忍 —— 用 `[\d.]+(?:px)?` 抓三档。
    const offsets = [...GLASS_CARD_LIFT.matchAll(/(-?[\d.]+(?:px)?)\s+(-?[\d.]+(?:px)?)\s+(-?[\d.]+(?:px)?)/gu)]
    assert.ok(offsets.length >= 1, '悬浮投影至少一条')
    const num = s => Number(s.replace('px', ''))
    const ys = offsets.map(m => num(m[2]))
    assert.ok(ys.every(y => y > 0), `投影应向下落（y > 0），实际 ${JSON.stringify(ys)}`)
  })

  it('悬浮投影应该 收在「有抬升但克制」的区间 —— 别再加回去', () => {
    // ## 2026-09-18 二次调整（owner：「有点重了，阴影有点大，往回收收」）
    //
    // 首版取 `.30 / 28px / y10`，owner 真机看后判断偏重。回收后的真机阶梯
    // （卡片正下方影子带亮度，越高=越淡）：
    //   首版 .30/28/y10 → 216.8 ；**现 .24/22/y8 → 228.4** ；.12/14/y4 → 243.1 ；.06/10/y3 → 246.6
    //
    // 本用例把**上限**钉住：这条影子只能「不被加深」。它不是审美偏好 ——
    // 是 owner 已经就这同一个旋钮来回走过一次，避免第三个人再推上去。
    const alphas = [...GLASS_CARD_LIFT.matchAll(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/gu)].map(m => Number(m[1]))
    assert.ok(alphas.length >= 1, '应能解析出投影 alpha')
    assert.ok(Math.max(...alphas) <= 0.26, `主投影 alpha 上限 0.26，实际 ${Math.max(...alphas)}（加回去前先确认 owner）`)
    const blurs = [...GLASS_CARD_LIFT.matchAll(/0\s+[\d.]+px\s+([\d.]+)px/gu)].map(m => Number(m[1]))
    assert.ok(Math.max(...blurs) <= 24, `最大模糊上限 24px，实际 ${Math.max(...blurs)}`)
    // 但也**不许收没** —— 悬浮感是上一轮明确要的（「增加一些悬浮感」）
    assert.ok(Math.max(...alphas) >= 0.15, `主投影 alpha 不得低于 0.15，实际 ${Math.max(...alphas)}（收没了就退回「读不出抬升」）`)
  })
})

describe('glass：边界与纪律', () => {
  it('except 右边栏与卡片，规则应该 限定在 active 相位（hero / settling 下顶栏是隐藏的，补 76px 会把正文顶下去）', () => {
    // **例外一**：右边栏（`[data-sidebar-right-panel]`）在**所有相位**都存在
    // （hero 页也能开文件面板），所以它那条不该限定 active。
    // 它的**内容宿主**同理：dockkit 的 `[data-dockkit-pane]` / `[data-dockkit-empty]`
    // 是真正刷底色的那两层，面板在任何相位都要着色 —— 一并豁免。
    const EXEMPT = [`[${RIGHT_PANEL_ATTR}]`, '[data-dockkit-pane]', '[data-dockkit-empty]']
    // **例外二**：卡片那两条走 `:is(active, hero)` —— 首页也要玻璃（见下一条用例）。
    // 这里断言其余规则**逐个**都是**单** active 相位，别顺手放宽了别的。
    const CARD = '[data-composer-card]'
    // **例外三**：官方那些**吸顶遮罩行**（`[data-disclosure-row]`，展开的 Think 行）——
    // 它们在**滚区内部**，与顶栏相位无关（hero 下也能展开），所以不带 active 门。
    // 它们要的是「底色等于它盖住的内容底」，而地面在任何相位都着色。
    const DISCLOSURE = '[data-disclosure-row]'
    const blocks = rules.split('}').filter(block => block.includes('{'))
    for (const block of blocks) {
      const selector = block.slice(0, block.indexOf('{')).trim()
      if (selector === '' || EXEMPT.some(e => selector.includes(e)) || selector.includes(CARD)) continue
      if (selector.includes(DISCLOSURE)) {
        assert.ok(
          selector.includes('[data-expanded]') && selector.includes('[data-open]'),
          `吸顶遮罩行必须收窄到官方加底的那个状态：${selector}`,
        )
        continue
      }
      assert.match(selector, /\[data-phase='active'\]/u, `规则「${selector}」必须限定 active 相位`)
      assert.ok(!selector.includes(':is('), `规则「${selector}」不得放宽相位 —— 只有卡片两条可以`)
    }
  })

  it('新会话首页（hero）的输入框卡片也要玻璃 —— owner：「新会话首页的输入框，也得适配下」', () => {
    // 根因：官方 `data-phase` 有**三档**（`ConversationRoot.tsx:355`：
    // settling / hero / active），首页走 **hero**。本模块原先每条规则都写死 active，
    // 于是首页**一条都不命中** → 卡片留着官方的 `background: var(--dsw-specific-input-major)`
    // （不透明实色，`InputBar.module.css:56`）= owner 截图里那张「纯色灰板」。
    assert.deepEqual([...GLASS_CARD_PHASES], ['active', 'hero'], '卡片必须覆盖 active 与 hero')
    for (const phase of GLASS_CARD_PHASES) {
      assert.match(css, new RegExp(`\\[data-phase='${phase}'\\]`, 'u'), `卡片规则应覆盖 ${phase} 相位`)
    }
    // 卡片规则（深轴本体 + 深轴玻璃层 + 浅轴本体 + 浅轴玻璃层 + 未选工作区）都得带相位门。
    // ⚠️ 第三条（待启动态）**也必须覆盖 hero** —— 「未选工作区」就发生在 hero 页
    // （`InputBar` 的 workspaceTrigger 条件：inert && !removed && onRequestWorkspace）。
    // 2026-09-24 起玻璃拆成「本体 + ::before」两条，故由 3 条变 5 条。
    const cardBlocks = rules.split('}').filter(b => b.includes('[data-composer-card]'))
    assert.equal(cardBlocks.length, 5, '卡片应有深轴（本体 + 玻璃层）/ 浅轴（本体 + 玻璃层）/ 待启动态五条规则')
    for (const block of cardBlocks) {
      const selector = block.slice(0, block.indexOf('{')).trim()
      for (const phase of GLASS_CARD_PHASES) {
        assert.ok(selector.includes(`[data-phase='${phase}']`), `「${selector}」缺 ${phase} 相位`)
      }
    }
  })

  it('⛔ 底座不透带必须死守 active —— hero 下底座不是定位元素，带子会横贯整个对话区底部', () => {
    // 底座那条 `::after` 是 `position: absolute; bottom: 0`，**包含块来自底座自己**。
    // 而官方只在 `.root[data-phase='active'] .composerSeat` 里写 `position: sticky`
    // （`ConversationRoot.module.css:369-371`）——**hero 下底座是 static**，
    // 于是带子会改锚最近的定位祖先（`.root`），在整个对话区底部横画一条实色带。
    // 所以放宽相位时**绝不能**顺手带上这条（这正是本轮要防的过冲）。
    const seatStart = rules.indexOf("'active'] [data-composer-seat] {")
    assert.ok(seatStart > 0, '底座本体那条应仍是单 active 相位')
    const after = rules.slice(rules.indexOf('::after', seatStart))
    const selectorEnd = after.indexOf('{')
    const body = after.slice(selectorEnd)
    assert.match(body.slice(0, body.indexOf('}')), /bottom: 0/u, '带子锚底')
    // 带子所在规则的选择器不得出现 hero
    const selector = rules.slice(rules.lastIndexOf('}', seatStart) + 1, rules.indexOf('{', seatStart + 20))
    assert.ok(!selector.includes('hero'), `底座不透带不得覆盖 hero：${selector.trim()}`)
  })

  it('右边栏应该 自己画一遍光与颗粒（它被抬到 82，吃不到 80 的背景层）', () => {
    // owner：「官方的右边栏，咱们样式没有适配过去好像」。
    // 根因：为不被抬到 81 的内容层盖住，右边栏被抬到了 82 —— 而背景层在 80，
    // 于是它**跑到背景层上面**，底色被 token 染对了、但那层**光与颗粒吃不到**。
    // 修法：让它自己叠一遍背景层那套（与顶栏同一思路；区别是顶栏半透明、它是不透明实色底）。
    const start = rightPanelRuleStart(rules)
    assert.ok(start > 0, '应能找到右边栏规则')
    const rule = rules.slice(start, rules.indexOf('}', start))
    assert.match(rule, /background-image:/u, '右边栏应自己叠光与颗粒')
    // 必须用与背景层**同源**的渐变串（不复制粘贴数值）
    assert.ok(rule.includes(BACKDROP_GRADIENTS), '应复用 BACKDROP_GRADIENTS（与背景层同源）')
    // ⚠️ 颗粒**不许**当普通背景层（owner 真机报「6 个色调背景依然没改好」的那条竖线）：
    // 背景层的颗粒走 ::after + opacity + 深色轴 mix-blend-mode: screen，
    // 而正常合成的第 4 层会**同时压暗**黑像素 —— 两者质感不同，交界即竖线。
    assert.ok(!rule.includes(GRAIN_TILE_VARIABLE), '不得把颗粒当普通背景层（质感与背景层对不上）')
    // ⚠️ 不得写 background 简写 —— 那会把官方的 bg-base 底色一起重置
    assert.ok(!/\bbackground:/u.test(rule), '不得用 background 简写（会重置官方底色）')
    assert.ok(!rule.includes('background-color:'), '不该动官方底色（它已被 token 染对）')
    // ⚠️ 0.1.7：必须**同时**覆盖 dockkit 的内容宿主，否则被它的不透明底色整个盖掉
    //（owner 真机报「右边栏完全没适配」）。
    assert.ok(
      rule.includes('[data-dockkit-pane]'),
      '右边栏图层必须画到 [data-dockkit-pane] 上 —— dockkit 的内容宿主才是不透明那层',
    )
    assert.ok(rule.includes('[data-dockkit-empty]'), '空态宿主（[data-dockkit-empty]）同样要覆盖')
  })

  it('右边栏的颗粒必须与背景层**同构**（::after + opacity + 同混合模式）', () => {
    // owner：「另外咱们 6 个色调背景问题依然没改好」——右边栏与会话区之间那条竖直分界线。
    // 根因：背景层颗粒 = ::after + opacity +（深色轴）mix-blend-mode: screen（纯加法，只加亮）；
    // 而本模块曾把颗粒当**第 4 个背景层正常合成**（会同时压暗黑像素）→ 两侧质感差一档。
    // 修法：面板侧也改成 ::after，并与背景层**逐项对齐**（贴图 / opacity / 混合模式）。
    const afterStart = rules.indexOf('[data-dockkit-pane]::after')
    assert.ok(afterStart > 0, '应有一条 [data-dockkit-pane]::after 的颗粒规则')
    const block = rules.slice(afterStart, rules.indexOf('}', afterStart))
    assert.ok(block.includes('content:'), '颗粒伪元素要有 content')
    assert.ok(block.includes('inset: 0'), '颗粒要铺满宿主')
    assert.ok(block.includes(GRAIN_DATA_URI), '颗粒贴图必须与背景层**同一张**（GRAIN_DATA_URI 直引）')
    assert.match(
      block,
      new RegExp(`opacity:\\s*var\\(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY}\\)`, 'u'),
      '深色轴 opacity 必须与背景层同源（同一个统一变量 + 同一个回落值）',
    )
    assert.ok(
      block.includes('pointer-events: none'),
      '颗粒层不得吃指针事件（拖拽条 / 面板交互不能被它挡住）',
    )
    // 两个轴的混合模式都要在（深色 screen / 浅色 multiply），且值直引背景层常量
    assert.ok(
      rules.includes(`mix-blend-mode: screen`) && rules.includes(`mix-blend-mode: multiply`),
      '深色轴 screen、浅色轴 multiply —— 与背景层同构',
    )
    const lightBlock = rules.slice(rules.indexOf('data-ds-dark-theme]:not('), rules.length)
    assert.match(
      lightBlock,
      new RegExp(`opacity:\\s*var\\(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY_LIGHT}\\)`, 'u'),
      '浅色轴 opacity 必须与背景层同源（同一个统一变量 + 浅色轴回落值）',
    )
    // ⚠️ ::after 需要包含块，而官方 .tabHost / .emptyTabHost 是 static —— 必须补 position。
    // 但**只能补在 dockkit 宿主上，不能补在 [data-sidebar-right-panel] 上**：
    // 官方面板是 ".panel { position: absolute; top/right/bottom: 0 }"，靠 absolute 拉满可视高，
    // 面板写成 relative 后高度改由内容撑开（实测长文件预览 = 11842px），内层 overflow:auto 失效
    // ⇒ owner 报的「右边栏文件预览滚动坏了」。故这里断言拆开后的两条规则各自正确。
    // 注意按**声明**判断，不能正则 "position:" —— 面板那条里有 "background-position:"。
    const panelStart = rightPanelRuleStart(rules)
    const panelBody = rules.slice(panelStart, rules.indexOf('}', panelStart))
    const panelDecls = panelBody.slice(panelBody.indexOf('{') + 1).split(';').map(d => d.trim()).filter(Boolean)
    assert.ok(
      !panelDecls.some(d => d.startsWith('position')),
      '不得给 [data-sidebar-right-panel] 写 position（会顶掉官方 absolute，撑坏右栏滚动）',
    )
    // 拆成规则块逐个查：必须存在一条「选择器含 [data-dockkit-pane] 且声明含 position: relative」的规则，
    // 且**没有任何**规则把 position 声明在**面板元素自己**身上。
    // ⚠️ 判据是「选择器的**主体**（最后一个复合选择器）是不是面板」，不能只看选择器里
    // 有没有出现面板属性 —— 2026-10-01 加右栏顶条玻璃时，条的选择器以
    // `[data-sidebar-right-panel][data-sidebar-right-open] [data-dockkit-strip]` 收窄，
    // 主体是**条**（面板的后代），把它误判成「在面板上写 position」就是假阳性。
    const blocks = rules.split('}').map(b => b.trim()).filter(Boolean)
    const panePositionRule = blocks.find(b => b.includes('[data-dockkit-pane]') && /position:\s*relative/u.test(b.slice(b.indexOf('{'))))
    assert.ok(panePositionRule, 'dockkit 宿主必须有一条 position: relative（给 ::after 当包含块）')
    /** 选择器的**主体**：按逗号拆开后，每个选择器去掉伪元素、取最后一个复合选择器。 */
    const subjects = (selector) => selector
      .split(',')
      .map(s => s.replace(/::?[a-z-]+(\([^)]*\))?/gu, '').trim())
      .map(s => s.split(/\s+/u).filter(Boolean).pop() ?? '')
    /** 声明块里是否**真的**声明了 position —— 必须按声明判断，
     *  不能正则 `position:`：面板那条自带 `background-position:`，正则会误判（本节注释上面的原话）。 */
    const declaresPosition = (decl) => decl
      .slice(decl.indexOf('{') + 1)
      .split(';')
      .map(d => d.trim())
      .some(d => d.startsWith('position'))
    const offending = blocks.filter((b) => {
      const sel = b.split('{')[0]
      if (!sel.includes(`[${RIGHT_PANEL_ATTR}]`)) return false
      if (!declaresPosition(b)) return false
      // 只有「面板**自己**是主体」才算违规
      return subjects(sel).some(sub => sub.startsWith(`[${RIGHT_PANEL_ATTR}]`))
    })
    assert.equal(offending.length, 0,
      `position 不得声明在 [data-sidebar-right-panel] **自己**身上（会顶掉官方 absolute，撑坏右栏滚动）：${offending.map(b => b.split('{')[0].trim()).join(' | ')}`)
  })

  it('面板的图层必须门在「已展开」上（否则收起时那片渐变会压在会话区右侧）', () => {
    // owner 2026-09-29 报「右边栏打开过一次，背景就花了」。
    // 官方面板是**常驻元素**：收起时它不消失、宽度也仍是持久化的 --dsh-sidebar-width
    // （实测 576px，盒子 x=704..1280），只把**里面的** dockkit 宿主 translateX 移出 +
    // visibility:hidden。于是我们不门的话，那片 100vw×100vh 渐变会以 screen 常驻压在
    // 会话区右侧。冷启动从未展开时宽度为 0 所以看不出来 —— 展开一次后宽度被持久化 ⇒
    // 「打开过一次就花了」。官方在滑动开始前就置 data-sidebar-right-open，故门它不影响动画。
    // 按规则块逐个查：凡是**在面板自己身上**画图层的规则（background-image /
    // background-blend-mode），其选择器都必须带 [data-sidebar-right-open]。
    // ⚠️ 判据同「position 那条」：看选择器的**主体**是不是面板自己。
    // 2026-10-01 加的右栏顶条玻璃（主体是条 / 文件头行，面板只是收窄前缀）也必须带该门，
    // 但它是以**前缀**形式带的 —— 下面统一要求「选择器里出现该门」，两条都满足。
    const blocks = rules.split('}').map(b => b.trim()).filter(Boolean)
    const panelPaintRules = blocks.filter(b => {
      const sel = b.split('{')[0]
      if (!sel.includes(`[${RIGHT_PANEL_ATTR}]`)) return false
      const decl = b.slice(b.indexOf('{'))
      return /background-image|background-blend-mode/u.test(decl)
    })
    assert.ok(panelPaintRules.length > 0, '应能找到面板那条画图层的规则')
    for (const rule of panelPaintRules) {
      assert.match(
        rule.split('{')[0],
        /\[data-sidebar-right-open\]/u,
        `面板相关图层规则必须门在 [data-sidebar-right-open] 上，否则收起时会压住会话区：${rule.split('{')[0].trim()}`,
      )
    }
  })

  it('不应该 给浮层写规则（浮层是不透明 + 质感，走 src/surface.ts）', () => {
    // owner 口径：「弹出框透明的效果可以不要」，且 HIG：「Don't put glass on lists/cards/content」。
    // 两件事正交，混进来就会互相打脸。
    // **只看规则的选择器，不看注释** —— 本模块的注释里会引用浮层锚点做对比说明（那是文档，不是规则）。
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//gu, '') // 去注释
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.endsWith('{'))
    for (const selector of selectors) {
      assert.ok(!selector.includes('[role='), `玻璃表的选择器里不该出现 role 锚点：${selector}`)
    }
    assert.ok(!css.replace(/\/\*[\s\S]*?\*\//gu, '').includes(':has('), '玻璃表里不该出现 :has()')
  })

  it('每条规则都应该 带「官方默认」门（owner：官方默认的都不要动）', () => {
    // 玻璃与色调无关，但它会改顶栏与输入框的样子；选「默认」那一轴时整表必须让路，
    // 外观与没装插件逐像素一致。门由 client 按 backdropPlan().hidden 打在 body 上。
    const blocks = rules.split('}').filter(block => block.includes('{'))
    for (const block of blocks) {
      const selector = block.slice(0, block.indexOf('{')).trim()
      if (selector === '') continue
      // 门必须在，但**允许前面带明暗轴限定**（如 `body[data-ds-dark-theme]:not([plain])`）
      // —— 颗粒那两条按轴分混合模式，不能要求一定以 `body:not([plain])` 开头。
      assert.ok(
        selector.startsWith('body') && selector.includes(`:not([${PLAIN_ATTR}])`),
        `规则「${selector}」缺少官方默认门`,
      )
    }
  })

  it('phaseGate 应该 单相位不加 :is、多相位用 :is（特异度不变）', () => {
    // 用 `:is()` 而不是并列选择器，是为了**不改变特异度**：`:is()` 取参数中最高者，
    // 两个参数都是 (0,1,0) 的属性选择器，整条规则的特异度与原先写死 active 时完全一致。
    // （底座那条注释记着特异度算错的代价 —— 曾把 sticky 压成 relative。）
    assert.equal(phaseGate(['active']), "[data-phase='active']", '单相位不加 :is（保持不变）')
    assert.equal(phaseGate(['active', 'hero']), ":is([data-phase='active'], [data-phase='hero'])")
    // 特异度等价：:is() 里没有比属性选择器更强的成分
    assert.ok(!/:is\([^)]*(?:\{|\.|#)/u.test(phaseGate(['active', 'hero'])), ':is() 里不该混入更强成分')
  })

  it('不应该 依赖官方 hashed 类名（只用 data / role 锚点）', () => {
    // 官方 CSS-module 类名形如 ._8HJdBW_cube / .bVCLcG_row —— 出现即说明我们在硬编码内部类名
    assert.ok(!/\.[A-Za-z0-9]*_[A-Za-z0-9]{4,}/u.test(css), '不得出现 hashed 类名')
  })

  it('应该 只引用四个公开 data 锚点', () => {
    for (const hook of [
      '[data-phase=',
      "[data-slot='conversation.header']",
      '[data-conversation-scroll]',
      '[data-composer-seat]',
    ]) {
      assert.ok(css.includes(hook), `缺少锚点 ${hook}`)
    }
  })

  it('轨迹视图（[data-conversation-composer-overlay]）必须自己画一遍地面 —— 座底带子才不会凸出一条横档', () => {
    // owner 报「轨迹页输入框下面那块的颜色和上面不一样」。
    // 根因：轨迹视图根自己刷一层**不透明** --dsw-alias-bg-layer-1（官方 views.module.css 的 .root），
    // 而它在本插件里被抬到 81 之上 ⇒ 我们的装饰层（z 80）整块被它盖住
    // （实测隐藏装饰层本页只变 mean 0.02 / max 1，对话页是 10.1）。
    // 座底那条 46px 带子按自己的配方重画（不透明 bg-base + 光 + 颗粒），
    // 于是带 vs 上方轨迹地面差一整档 = 16（实测）。
    // 修法同右边栏那次：把我们的材质原样画到那块不透明面上。
    const OVL = '[data-conversation-composer-overlay]'
    const ovlRules = rules.split('}').filter(b => b.includes('{') && b.slice(0, b.indexOf('{')).includes(OVL))
    assert.ok(ovlRules.length > 0, `应能找到轨迹视图的地面规则（锚点 ${OVL}）`)
    for (const rule of ovlRules) {
      const selector = rule.slice(0, rule.indexOf('{')).trim()
      const body = rule.slice(rule.indexOf('{') + 1)
      // 每个选择器都必须带官方默认门 + 只 active（与座底带子同相位）
      assert.ok(
        selector.startsWith(`body:not([${PLAIN_ATTR}])`),
        `轨迹地面规则必须带官方默认门：${selector}`,
      )
      assert.ok(selector.includes("[data-phase='active']"), `轨迹地面规则只该覆盖 active：${selector}`)
      // 必须是「原样重画地面」：不透明底色 + 同源的光 + 颗粒（漏任一项就与座底带子不同源）
      assert.match(body, /background-color: var\(--dsw-alias-bg-base\)/u, `轨迹地面必须不透明（原样 token）：${selector}`)
      assert.ok(body.includes(`var(${GRAIN_TILE_VARIABLE}, none)`), `轨迹地面必须带颗粒：${selector}`)
      assert.ok(body.includes(BACKDROP_GRADIENTS), `轨迹地面必须与背景层同源的光：${selector}`)
      assert.match(body, /background-attachment: fixed;/u, `轨迹地面必须用 fixed 让百分比按视口解析：${selector}`)
      assert.ok(!body.includes('scroll, fixed'), `不得写 scroll, fixed（层数不足会被循环补齐）：${selector}`)
      assert.ok(!body.includes('backdrop-filter'), `地面不模糊，只是重画：${selector}`)
      // 不得出现 hashed 类名 / 不得碰几何
      assert.ok(!/\.[A-Za-z0-9]*_[A-Za-z0-9]{4,}/u.test(selector), `不得用官方 hashed 类名：${selector}`)
      assert.ok(!/\b(?:top|left|right|bottom|width|height)\s*:/u.test(body), `地面规则不得改几何：${selector}`)
    }
    // 锚点必须是**公开属性**（官方 TrajectoryView.tsx:511 / TrajectoryTable.tsx:2586-2592）
    assert.ok(ovlRules.some(r => r.includes(`${OVL} table`)), '必须覆盖会滚动的表格宿主')
  })

  /**
   * 右栏顶部两条 38px 带的玻璃 —— **本条是 2026-10-01 对上一轮错判的纠正**。
   *
   * ## 上一轮错在哪（别再照抄那个结论）
   *
   * 上一轮（2026-09-30）的结论是「那里没有内容经过 ⇒ 不需要改」，并加了一条**反向**守卫
   * 禁止给这两条带做 backdrop-filter。那个结论的**测量本身是错的**：
   * 当时 [data-dockkit-strip] 是 position: static，加在它上面的
   * ::before { position: absolute; z-index: -1 } 会改锚**最近的定位祖先**
   * （[data-dockkit-pane]，它是 relative），伪元素根本没画在条上 ——
   * 量出来的 mean 0.028 是「伪元素画错了地方」，不是「画了没用」。
   *
   * 「有没有内容滚过去」与「看起来像不像对话区顶栏」是**两个问题**：
   * 前者确实成立（列表滚不到 0..76），但 owner 问的是后者。
   *
   * ## 真正的判据（2026-10-01 实测，1600x900 深色轴）
   *
   * 同一 x 带、同 y，**右栏关（对话区顶栏占位）vs 右栏开**：
   *   修复前  条 HF 2.313 / 亮度 23.27   ← 颗粒是「生的」（pane 的 ::after 未被 blur 糊过）
   *   对话区顶栏 HF 0.256 / 亮度 18.46
   *   修复后  条 HF 0.254 / 亮度 18.27   ⇒ |ΔHF| 0.002、|Δlum| 0.19，同档。
   *
   * 所以现在的守卫是**正向**的：这两条必须带上与顶栏同源的玻璃，且必须抬到颗粒层之上
   * （否则自己的 backdrop-filter 糊不到那层颗粒 —— 那正是上一轮没量对的地方）。
   */
  it('右栏顶条必须带与对话区顶栏同源的玻璃（含 backdrop-filter + 抬到颗粒层之上）', () => {
    const all = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    const blocks = all.split('}').map(b => b.trim()).filter(b => b.includes('{'))
    const STRIP = '[data-dockkit-strip]'
    // ⚠️ **括号感知**拆分选择器：`> *:first-child:not([a]):not([b])` 里没有裸逗号，
    //    但将来若写成 `:not(a, b)` 那种带参形式，朴素 split(',') 会把参数切断。
    const splitSels = (text) => {
      const parts = []
      let depth = 0, cur = ''
      for (const ch of text) {
        if (ch === '(') depth++
        else if (ch === ')') depth--
        if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
      }
      parts.push(cur)
      return parts.map(s => s.trim()).filter(Boolean)
    }

    // ⛔ **0..76 只许有一个玻璃面**（owner 2026-10-02 第三次复报「明显有条分割线，应该是一个整体」）。
    //    上一版是「条自己 + 各标签头行」两个 ::before 面。
    //    ⚠️ 归因分两步、别只记住第一步：把内容全藏起来只量静态净玻璃时，主导项是**渐变相位**
    //    （background-position 相对自己盒子顶边解析，下带把同一张 900px 高的渐变图从第 0 行
    //    重新开始）—— 只摘 background-image 台阶恰好归零。
    //    但**有真实内容**在带下滚动时，真正的主因是**采样边界**：blur 的采样区是元素的边框盒，
    //    两个盒子各自在 y=38 结束 / 开始。实测（TEMP/final2.mjs，预览滚到 200、逐列有符号台阶中位）：
    //      两面相位不对齐 8.72 / 补 -38px 6.86 / 补 -76px 4.86 / 无玻璃 -0.28
    //    ⇒ 相位对齐**只能压到 4.86、压不到 0**，唯让 0..76 落进**同一个边框盒**才彻底。
    //    所以这条守卫盯的是「面的个数」，而下面那条「向上多铺一条带」盯的是采样区是否重合。
    //    ⚠️ 范围只限**右栏面板**：对话区顶栏 / 输入框卡各有自己那份玻璃面，与这条无关。
    const faces = blocks.filter((b) => {
      const sel = b.split('{')[0]
      return sel.includes('::before') && /backdrop-filter/u.test(b)
        && sel.includes(RIGHT_PANEL_ATTR) && sel.includes('[data-dockkit-pane]')
    })
    assert.equal(
      faces.length, 1,
      `右栏 0..76 只许有**一个**玻璃面（两个面会在 y=38 切出渐变相位台阶）：`
      + `${faces.map(b => b.split('{')[0].trim()).join(' | ')}`,
    )
    const face = faces[0]
    const faceSel = face.split('{')[0]
    const faceBody = face.slice(face.indexOf('{'))
    // ⛔ **面不得挂在 pane 本体上**（owner 复报「分割线」后我改到这上面过，随即量出回归）。
    //    pane 是**所有**标签页的公共祖先，挂它上面会盖住**没有头行**的标签：
    //    终端正文正好从 y=38 起，没有任何 38px 头行替它把这层让开。
    //    实测终端正文带 38..76：挂 pane 时 HF 1.53 → **0.20**、亮度 28.9 → **20.1**（被糊掉）；
    //    挂各标签自己的头行上则 HF 1.30 / 亮度 23.1，与「无玻璃」对照（1.33 / 32.4）同档。
    assert.ok(
      !/\[data-dockkit-pane\]::before/u.test(faceSel),
      `玻璃面不得挂在 [data-dockkit-pane]::before 上（会盖住终端这类没有头行的标签的正文）：${faceSel.trim()}`,
    )
    // 面必须挂在**各标签自己的 38px 头行**上（逐个用带取值的公开属性锚定）。
    for (const one of splitSels(faceSel)) {
      assert.ok(
        /\[data-files-state='tree'\]|\[data-textpreview-state='(?:text|unsupported)'\]/u.test(one),
        `玻璃面必须锚在各标签自己的头行上（且属性带取值）：${one}`,
      )
      assert.ok(
        one.trim().endsWith('::before'),
        `玻璃面必须锚在头行那个元素自己的 ::before 上：${one}`,
      )
    }
    // ⛔ **向上铺满两条带**：面虽然挂在头行上，盒子必须从面板 y=0 起、高 76 ——
    //    这一条才是「无缝」的成因：blur 的采样区是**边框盒**，只有条那半与头行那半
    //    落在**同一个盒子**里，y=38 两侧算出的颜色才一致。
    //    实测（真实内容滚到 200）y=38 的逐列有符号台阶：两个各自 38px 的盒子时 **8.72**
    //    （对照行仅 0.28~0.79）；铺成 0..76 后 **-0.79**，与对照行同档。
    assert.match(
      faceBody, new RegExp(`top:\\s*-\\$\\{PANEL_BAND_PX\\}px|top:\\s*-${PANEL_BAND_PX}px`, 'u'),
      `玻璃面必须向上多铺一条带（top = -PANEL_BAND_PX = -${PANEL_BAND_PX}px），否则采样区在 y=38 被边界截断、又切出一条缝：${faceBody}`,
    )
    // ⚠️ 盒子必须**下沿贴内边距盒底、上沿再往上一条带**（= 覆盖面板坐标 0..75），
    //    而且**不许写死 height**（owner 2026-10-02：「右边栏下边那条细线没有了」）。
    //    官方头行的 border-bottom 画在它边框盒的最后 1px（75..76）：
    //    写死 height: 76 会让面一直铺到 76，把那条细线压在自己 70% 填充之下
    //    （实测 y=75 亮度 58.7 → 18.8）；bottom: 0 止于内边距盒底（75）后细线回来（52.3）。
    //    这也让本面的盒子与**对话区顶栏那个面**（inset: 0 ⇒ 计算 height 75px）完全一致。
    assert.match(faceBody, /bottom:\s*0/u, `玻璃面必须 bottom: 0（止于内边距盒底，把官方那 1px 下边框让出来）：${faceBody}`)
    assert.match(faceBody, /height:\s*auto/u, `玻璃面必须 height: auto（写死 height 会盖掉头行的下边框）：${faceBody}`)
    assert.doesNotMatch(
      faceBody, new RegExp(`height:\\s*(?:\\$\\{HEADER_HEIGHT_PX\\}|${HEADER_HEIGHT_PX})px`, 'u'),
      `玻璃面不得写死 height = HEADER_HEIGHT_PX（会把头行那条 1px 下边框洗掉，owner 复报过）：${faceBody}`,
    )
    // ⚠️ 给**伪元素**加 z-index 不等于给 pane 建层叠上下文：pane 本身仍是 relative + auto，
    //    官方 --dsh-dockkit-dock-layer / float-layer 的次序一点没动（这正是上一版否掉这条路的理由，已不成立）。
    assert.match(faceBody, /position:\s*absolute/u, `玻璃面必须绝对定位（不参与流）：${faceBody}`)
    assert.doesNotMatch(faceBody, /\binset:\s*0/u, `玻璃面不得用 inset: 0（那会铺满整个 pane 而不是两条带）：${faceBody}`)
    // 两道门都要在（与其余右栏规则同纪律）。
    for (const one of splitSels(faceSel)) {
      assert.ok(one.includes(`:not([${PLAIN_ATTR}])`), `玻璃面的选择器必须带官方默认门，缺在这条：${one}`)
      assert.ok(one.includes('[data-sidebar-right-open]'), `玻璃面的选择器必须门在 [data-sidebar-right-open] 上，缺在这条：${one}`)
    }
    // 模糊强度与顶栏**同源**（直引常量，不许复制粘贴字面量）
    assert.ok(faceBody.includes(GLASS_BLUR), `玻璃面的模糊必须直引 GLASS_BLUR（与顶栏同源）`)
    // 填充比例与顶栏同一个 alpha（GLASS_HEADER_ALPHA），不新造一个数
    assert.match(
      faceBody,
      new RegExp(`color-mix\\(in srgb, var\\(--dsw-alias-bg-base\\) ${Math.round(GLASS_HEADER_ALPHA * 100)}%, transparent\\)`, 'u'),
      `玻璃面的填充必须用 GLASS_HEADER_ALPHA（${GLASS_HEADER_ALPHA}）与顶栏同参`,
    )
    // 光必须与顶栏同源（同一条 dimmedBackdropGradients(HEADER_LIGHT_SCALE)）
    assert.ok(
      faceBody.includes(dimmedBackdropGradients(HEADER_LIGHT_SCALE)),
      `玻璃面的光必须与顶栏同源（dimmedBackdropGradients(HEADER_LIGHT_SCALE)）`,
    )
    // ⚠️ 不许用 background-attachment: fixed：面板会被官方 translate，
    //    fixed 会被重解析到 transform 后的坐标系。必须用右栏那套 100vw x 100vh + 右对齐相位。
    assert.match(faceBody, /background-attachment:\s*scroll;/u, `玻璃面必须用 scroll（面板会被 transform，fixed 会被重解析）`)
    assert.ok(faceBody.includes('100vw 100vh'), `玻璃面必须显式给视口尺寸背景盒`)
    assert.ok(
      faceBody.includes('right calc(0px - var(--dsh-windows-titlebar-height, 0px))'),
      `玻璃面必须右对齐并减去 caption 高度（与右栏材质同相位）`,
    )
    // ⑧ 不得写官方 hashed 类名
    assert.ok(!/\.[A-Za-z0-9]*_[A-Za-z0-9]{4,}/u.test(faceSel), `玻璃面不得用官方 hashed 类名：${faceSel.trim()}`)

    // ⑨ 抬到**玻璃面之上**：玻璃面挂在各标签自己的头行上（那条头行规则的 ::before，z-index: -1），
    //    而头行自己抬成 position: relative + z-index: 2（自己那条规则里 create stacking context），
    //    条再抬到 z-index: 3 —— 条内的标签 / 按钮于是落在头行那层的填充之上，文字不被压暗
    //    （实测条内 chrome 37 个元素的盒子与旧版逐像素一致）。
    //    ⚠️ 条的抬升必须**严格高于**头行的抬升，否则头行那层覆盖条区时会把条内 chrome 压暗。
    const stripLift = blocks.find((b) => {
      const sel = b.split('{')[0]
      const body = b.slice(b.indexOf('{'))
      return splitSels(sel).some(s => s.includes(STRIP) && !s.includes('::before'))
        && /z-index:\s*3/u.test(body) && /position:\s*relative/u.test(body)
    })
    assert.ok(
      stripLift !== undefined,
      'dockkit 条必须抬到 z-index: 3（严格高于头行那层 z-index: 2）—— '
      + '否则头行的 70% 填充会盖到条上，条内标签与文字被压暗',
    )
    // ⚠️ **每一条带都必须自己也在抬升规则里**。
    //    只查「存在一条含 STRIP 的抬升规则」会漏掉：把第二行从抬升规则里摘掉、条留着，
    //    上面那条 assert 照样通过 —— 而第二行没被抬起来 ⇒ 它的文字被玻璃压暗。
    //    第二行的清单 = 各标签头行（带取值，只锚真有头行的状态）。
    const liftRule = blocks.find((b) => {
      const sel = b.split('{')[0]
      const body = b.slice(b.indexOf('{'))
      return splitSels(sel).some(s => s.includes("[data-files-state='tree']"))
        && /z-index:\s*2/u.test(body) && /position:\s*relative/u.test(body)
    })
    assert.ok(
      liftRule !== undefined,
      '各标签头行必须抬到自己的玻璃面之上（position: relative + z-index: 2）—— '
      + '否则头行自己的路径文字与按钮会被那层 70% 填充压暗',
    )
    // 头行抬升规则不得把条也一起抬进来（两者层级必须分开，见上）。
    assert.ok(
      !splitSels(liftRule.slice(0, liftRule.indexOf('{'))).some(s => s.includes(STRIP) && !s.includes('::before')),
      '条与头行的抬升必须分成两条规则（条 z-index 3 / 头行 z-index 2），不得共用一个层级',
    )
    const liftSel = liftRule.slice(0, liftRule.indexOf('{'))
    const liftSels = splitSels(liftSel)
    const LIFTED = [
      { name: '文件树头行', match: (sel) => sel.includes("[data-files-state='tree']") },
      { name: '文档预览头行（text）', match: (sel) => sel.includes("[data-textpreview-state='text']") },
      { name: '文档预览头行（unsupported）', match: (sel) => sel.includes("[data-textpreview-state='unsupported']") },
    ]
    for (const t of LIFTED) {
      assert.ok(
        liftSels.some(one => t.match(one)),
        `${t.name}也必须**自己**出现在抬升规则里（否则它的文字 / 图标会被玻璃压暗）：${liftSel.trim()}`,
      )
    }

    // ⑩ ⛔ 状态必须**带取值**：把 [data-files-state] / [data-textpreview-state] 写成不带取值，
    //    会命中「没有头行」的那些状态。实测两处误伤：
    //      * data-files-state='no-workspace' —— 只渲染一段提示文字，没有 38px 头行，
    //        写成裸属性会把那段提示文字糊上一层（它正好是第一个孩子）；
    //      * data-textpreview-state='loading' —— 同理只有加载态。
    for (const attr of ['[data-files-state]', '[data-textpreview-state]']) {
      const bare = blocks.filter((b) => {
        const sel = b.split('{')[0]
        return sel.includes(attr) && /::before|position/.test(b)
      })
      assert.equal(bare.length, 0,
        `${attr} 必须带取值（只锚真有头行的状态），不得写成裸属性：${bare[0] ? bare[0].split('{')[0].trim() : ''}`)
    }

    // ⑪ ⚠️ 文档预览的横幅会把头行挤到第二个位置：必须同时覆盖「横幅 + 下一个兄弟」，
    //    否则元数据失败 / 文件已变更时，那一版的头行又没玻璃（而且 first-child 会命中的是横幅）。
    for (const banner of ['data-textpreview-meta-failed', 'data-textpreview-changed']) {
      assert.ok(
        all.includes(`[${banner}] + *`),
        `文档预览的 [${banner}] 横幅之后那条头行也必须覆盖（横幅会把它挤到第二个位置）`,
      )
    }

    // ⑬ ⛔ 右栏滚区的滚动条轨道必须下推到玻璃带下缘（owner 2026-10-02：
    //    「还有右边栏上面透明模糊后，滚动条不要跟着滚上去」）。
    //    与对话区那次同因：滚动条画在滚动容器的 **padding box** 上，那件
    //    「margin-top 负底距 + padding-top 补高」只推内容、不推它 ⇒ 轨道仍从 y=0 起画，
    //    前 76px 落在半透明玻璃带下面透出来。官方口径是先例：
    //    对话区用 `::-webkit-scrollbar-track { margin: calc(HEADER_HEIGHT_PX + 2px) 2px 2px }`。
    const trackRules = blocks.filter((b) => b.split('{')[0].includes('::-webkit-scrollbar-track'))
    const panelTrack = trackRules.filter((b) => {
      const sel = b.split('{')[0]
      return sel.includes(RIGHT_PANEL_ATTR) && sel.includes('[data-sidebar-right-open]')
    })
    assert.equal(
      panelTrack.length, 1,
      `右栏必须**恰好一条**滚动条轨道下推规则（漏了滑块会滚进玻璃带）：`
      + `${panelTrack.map(b => b.split('{')[0].trim()).join(' | ')}`,
    )
    assert.match(
      panelTrack[0], new RegExp(`calc\\(\\$\\{HEADER_HEIGHT_PX\\}px \\+ 2px\\)|calc\\(${HEADER_HEIGHT_PX}px \\+ 2px\\)`, 'u'),
      `轨道下推量必须是 calc(HEADER_HEIGHT_PX + 2px)（与对话区那份逐字同参）：${panelTrack[0]}`,
    )
    // ⚠️ 只许覆盖**流式文档的滚区**（与上面那份白名单同两个属性）：代码 / PDF / 图片 /
    //    表格 / office 这些「填满盒子」的渲染器有自己的内层滚动容器，动它们的轨道等于改官方布局。
    for (const one of splitSels(panelTrack[0].split('{')[0])) {
      assert.ok(
        one.includes("[data-textpreview-body]") || one.includes("[data-files-body]"),
        `轨道下推只许覆盖流式文档的滚区（[data-textpreview-body] / [data-files-body]）：${one}`,
      )
      assert.ok(
        one.includes("[data-document-preview$='/markdown']") || one.includes("[data-document-preview$='/text']") || one.includes("[data-files-state='tree']"),
        `轨道下推必须按**具体渲染器 / 标签**收窄，不得写成宽泛的容器选择器：${one}`,
      )
    }

    // ⑫ ⛔ 玻璃表不得出现 :has()（仓库既有纪律：开销集中在它上面，实测见 src/surface.ts）。
    //    本条第二行曾想用 `:has(+ 正文)` 表达「紧邻正文的那个兄弟」，被这条守卫拦下 —— 改用相邻兄弟组合符。
    assert.ok(!all.includes(':has('), '玻璃表里不该出现 :has()（第二行请用相邻兄弟组合符表达）')
  })

  it('右栏面板的真磨砂：正文必须真的能从两条 38px 带下面滚过去', () => {
    const all = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    const blocks = all.split('}').map(b => b.trim()).filter(b => b.includes('{'))
    const selsOf = (b) => b.split('{')[0]
    // 括号感知拆分（与上一条同因：`:not(a, b)` 这类带参形式会被朴素 split(',') 切断）。
    const splitTop = (text) => {
      const parts = []
      let depth = 0, cur = ''
      for (const ch of text) {
        if (ch === '(') depth++
        else if (ch === ')') depth--
        if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
      }
      parts.push(cur)
      return parts.map(s => s.trim()).filter(Boolean)
    }

    // ⓪ 上提量必须**等于顶栏那 76px**（= 两条 38px 之和）。写死一个别的数会让
    //    裁剪线与带下缘错位：露一条 76 高的空白或把正文切掉一截。
    assert.equal(
      PANEL_SCROLLER_LIFT_PX, HEADER_HEIGHT_PX,
      '上提量必须等于顶栏高度（两条 38px 带之和），否则裁剪线与带下缘错位',
    )

    // ① 存在「把滚区裁切框上提」的规则，且值直引常量（不复制字面量）。
    const lift = blocks.find((b) => /margin-top:\s*-/u.test(b) && selsOf(b).includes('data-textpreview-body'))
    assert.ok(lift !== undefined, `必须有一条把右侧滚区裁切框上提 -${PANEL_SCROLLER_LIFT_PX}px 的规则`)
    assert.ok(
      lift.includes(`margin-top: -${PANEL_SCROLLER_LIFT_PX}px`),
      `上提量必须直引 PANEL_SCROLLER_LIFT_PX（${PANEL_SCROLLER_LIFT_PX}），不得写别的字面量：${lift}`,
    )

    // ② ⛔ **补偿位移只许用 transform，不许用 padding-top**。
    //    官方 documentpreview/text/lines.ts 的「跳转到第 N 行」是
    //    body.scrollTop = max(0, row.offsetTop)，而 offsetTop **把 padding 算进去、
    //    不把 transform 算进去**。用 padding-top 补会把目标行落到 y=0（藏进两条带后面），
    //    实测两种写法落点差 76px（0 vs 76）—— 这正是本轮踩过的坑。
    const liftBody = lift.slice(lift.indexOf('{'))
    assert.ok(
      !/padding/u.test(liftBody),
      `裁切框上提的那条规则不得用 padding 补位移（offsetTop 会把 padding 算进去 ⇒ 官方跳行落点变 0）：${liftBody}`,
    )
    const shifted = blocks.filter((b) => {
      const sel = selsOf(b)
      return (sel.includes('data-textpreview-body') || sel.includes('data-files-body'))
        && sel.includes(RIGHT_PANEL_ATTR)
        && /transform:\s*translateY/u.test(b)
    })
    assert.ok(shifted.length > 0, '必须有一条用 transform: translateY 把内容视觉下移来配平上提的规则')
    assert.ok(
      shifted.some(b => b.includes(`translateY(${PANEL_SCROLLER_LIFT_PX}px)`)),
      `内容下移量必须直引 PANEL_SCROLLER_LIFT_PX（${PANEL_SCROLLER_LIFT_PX}），与上提量严格相抵`,
    )

    // ③ **不得**把 padding-top 用在右侧面板的任何滚区上（同上一条理由，且更宽地兜住）。
    for (const b of blocks) {
      const sel = selsOf(b)
      if (!sel.includes(RIGHT_PANEL_ATTR)) continue
      if (!sel.includes('data-textpreview-body') && !sel.includes('data-files-body')) continue
      assert.ok(
        !/padding(-top)?:/u.test(b),
        `右侧面板滚区不得用 padding 配平（会把官方行定位推歪 76px）：${sel.trim()}`,
      )
    }

    // ④ 每一条上提 / 下移的选择器都必须带**两道门**（官方默认门 + 面板已展开）。
    const gated = [...blocks.filter(b => /margin-top:\s*-/u.test(b) && selsOf(b).includes('data-textpreview-body')), ...shifted]
    let gateChecks = 0
    for (const b of gated) {
      for (const one of splitTop(selsOf(b))) {
        assert.ok(one.includes(`:not([${PLAIN_ATTR}])`), `真磨砂的每条选择器都要带官方默认门，缺在这条：${one}`)
        assert.ok(one.includes('[data-sidebar-right-open]'), `真磨砂的每条选择器都要带 [data-sidebar-right-open]，缺在这条：${one}`)
        gateChecks++
      }
    }
    assert.ok(gateChecks >= 4, `真磨砂的门检查至少应覆盖 4 条选择器，实际 ${gateChecks} 条`)

    // ⑤ ⛔ **白名单**：只放行「流式文档」的滚区。
    //    code / pdf / image / excel / office 的**内容根是 flex 填满整个 body**（实测 code 的内容根
    //    高 == body 可视高），永远不会有内容从带下流过；给它们上提 + 下移只会让内容根落到 76..976
    //    而 body 裁到 900 ⇒ 白掉底部 76px。所以数据预览必须锚在**渲染器 id** 上，不能只写
    //    [data-textpreview-body]（那把 code / pdf 一并收了）。
    for (const b of gated) {
      const sel = selsOf(b)
      if (!sel.includes('data-textpreview-body')) continue
      for (const one of splitTop(sel)) {
        if (!one.includes('data-textpreview-body')) continue
        assert.ok(
          one.includes('data-document-preview'),
          `文档预览的真磨砂必须按渲染器 id 收窄，不能只写 [data-textpreview-body] `
          + `（否则会把内容根填满盒子的 code / pdf 一并收进来，白掉底部 76px）：${one}`,
        )
      }
    }
    // 文件树那条用数据状态收窄（与玻璃头行同一套锚点）。
    assert.ok(
      gated.some(b => selsOf(b).includes("[data-files-state='tree']") && selsOf(b).includes('data-files-body')),
      '文件树的滚区也必须有一条真磨砂规则（它同样有内容可从带下滚过）',
    )

    // ⑥ 内容根**不是**滚区的直接孩子（中间隔着 display: contents 的插槽包装），
    //    故预览必须写「> * > *」。写成「> *」会落在不生成盒子的包装上 ⇒ transform 无效。
    assert.ok(
      gated.some(b => selsOf(b).includes('data-textpreview-body] > * > *')),
      '文档预览的内容根在「> * > *」那一层（插槽包装是 display: contents），必须按这一层写',
    )
    assert.ok(
      gated.some(b => selsOf(b).includes('data-files-body] > *')),
      '文件树的内容根就是滚区的直接孩子，必须按「> *」写',
    )

    // ⑦ ⚠️ 滚区里**在插槽包装之外**的那几个直接孩子也要一起挪 ——
    //    加载指示器 / 失败行 / 分页的「加载更多」。漏了它们，它们会比正文高 76px 藏进带里。
    for (const attr of ['data-document-loading', 'data-textpreview-failed', 'data-textpreview-more']) {
      assert.ok(
        gated.some(b => selsOf(b).includes(`> [${attr}]`)),
        `滚区的直接孩子 [${attr}] 也要一起下移（它渲染在插槽包装之外，漏了会藏进两条带里）`,
      )
    }

    // ⑧ 不得写官方 hashed 类名（与上一条同纪律）。
    for (const b of gated) {
      assert.ok(!/\.[A-Za-z0-9]*_[A-Za-z0-9]{4,}/u.test(selsOf(b)), `真磨砂不得用官方 hashed 类名：${selsOf(b).trim()}`)
    }
  })

  it('右栏真磨砂必须**两条带都通**：0..38 也要有内容经过', () => {
    const all = css.replace(/\/\*[\s\S]*?\*\//gu, '')
    const blocks = all.split('}').map(b => b.trim()).filter(b => b.includes('{'))
    const selsOf = (b) => b.split('{')[0]
    const P = `[${RIGHT_PANEL_ATTR}][data-sidebar-right-open]`
    const GATE = `body:not([${PLAIN_ATTR}])`

    // ⓞ 上提量必须是**两条带之和**（写死单条 38 会让裁剪线与带下缘错位）。
    //    与 PANEL_BAND_PX 的两倍关系一并钉住（38 是官方两条固定行高）。
    assert.equal(PANEL_SCROLLER_LIFT_PX, HEADER_HEIGHT_PX,
      '上提量必须等于顶栏 76px（= 两条 38px 带之和）')

    // ① 必须有一条规则把 pane 的**头行**在流内占的高度还回去。
    //    根因：头行在流内 ⇒ 体那两层（tabHostBody / tabBody）都从 y=38 起**且都裁剪**，
    //    正文永远进不了 0..38 ⇒ 上带背后只有面板纯色（owner：只有下半部分有效果）。
    //    ⚠️ 这里必须查 `margin-bottom`：把「负底距」误写成 `padding-bottom` 或者漏掉，
    //    0..38 就重新变成死区，而**下带照样是通的**，只量 0..76 平均值根本发现不了。
    const headerRule = blocks.find((b) => {
      const sel = selsOf(b)
      return sel.includes(GATE) && sel.includes(P) && sel.includes('[data-dockkit-pane]')
        && sel.includes('> *:first-child') && /margin-bottom:\s*-/u.test(b)
    })
    assert.ok(
      headerRule !== undefined,
      '必须把 pane 头行在流内占的高度还回去（margin-bottom 负值）—— 否则 0..38 是死区，'
      + '正文只能进到 38 以下，上带永远磨不到内容（这正是 owner 复报的「只有下半部分有效果」）',
    )
    assert.ok(
      headerRule.includes(`margin-bottom: -${PANEL_BAND_PX}px`),
      `负底距必须直引 PANEL_BAND_PX（${PANEL_BAND_PX}），不得写别的值：${headerRule}`,
    )

    // ② 体必须把让出的高度补回来（否则各标签内容整体上移 38px，压在条下面）。
    const bodyRule = blocks.find((b) => {
      const sel = selsOf(b)
      return sel.includes(GATE) && sel.includes(P) && sel.includes('[data-dockkit-pane]')
        && sel.includes('> *:last-child') && sel.includes('[data-sidebar-right-tab]')
        && /padding-top/u.test(b)
    })
    assert.ok(
      bodyRule !== undefined,
      'pane 体必须补 padding-top 把头行让出的高度还给各标签内容（否则内容整体上移 38px 藏进条里）',
    )
    assert.ok(
      bodyRule.includes(`padding-top: ${PANEL_BAND_PX}px`),
      `补回量必须直引 PANEL_BAND_PX（${PANEL_BAND_PX}），与负底距严格相抵：${bodyRule}`,
    )
    // ③ ⛔ border-box 必须有：体常是 height:100%，content-box 下加 padding 会把盒子撑到 938，
    //    外层 paneBody(overflow:auto) 于是多出 38px 外滚动（实测 maxScroll 从 8710 变 8670）。
    assert.ok(
      /box-sizing:\s*border-box/u.test(bodyRule),
      `补 padding 的那条必须同时写 box-sizing: border-box（否则盒子被撑高、外层多出 38px 滚动）：${bodyRule}`,
    )

    // ④ ⛔ 不许用 `position: absolute` 实现「头行离开文档流」：条同时是我们的玻璃锚点
    //    与官方的拖动目标，把它从流里摘出去会多一层风险面。只用负底距。
    for (const b of [headerRule, bodyRule]) {
      assert.ok(
        !/position:\s*absolute/u.test(b),
        `实现方式必须只用负底距 / padding，不得把条或头行改成 position: absolute：${selsOf(b).trim()}`,
      )
    }

    // ⑤ 两道门都要在（与真磨砂其余规则同纪律）。
    for (const b of [headerRule, bodyRule]) {
      assert.ok(selsOf(b).includes(`:not([${PLAIN_ATTR}])`), `缺官方默认门：${selsOf(b).trim()}`)
      assert.ok(selsOf(b).includes('[data-sidebar-right-open]'), `缺面板已展开门：${selsOf(b).trim()}`)
    }

    // ⑥ ⛔ **两条带必须分别量**这条纪律，也钉在测试里：
    //    上提量必须覆盖整个 HEADER_HEIGHT_PX（= 两条带），不能只覆盖一条 ——
    //    `PANEL_BAND_PX * 2 === HEADER_HEIGHT_PX` 是「两条都算进去」的可执行表述。
    assert.equal(PANEL_BAND_PX * 2, HEADER_HEIGHT_PX,
      '单条带高 × 2 必须等于顶栏高度（否则「两条带」里必有一条没被覆盖）')
  })
})

/**
 * 取 `buildSeamCss()` 里**最后一条**匹配 needle 的规则（选择器 + 声明块，已剥注释）。
 *
 * 「最后一条」是有意的：缺口补丁追加在缝挡板三条**之后**，而它与缝挡板共用
 * `:has(> [data-composer-card])` 这个宿主选择器 —— 只有取最后一条才拿得到补丁本体。
 * @param needle - 选择器片段。
 * @returns 命中规则文本。
 */
const lastRuleWith = (text, needle) => {
  const clean = text.replace(/\/\*[\s\S]*?\*\//gu, '')
  const at = clean.lastIndexOf(needle)
  assert.ok(at >= 0, `找不到规则：${needle}`)
  return clean.slice(clean.lastIndexOf('}', at) + 1, clean.indexOf('}', at) + 1)
}

describe('glass：输入框卡上圆角缺口补丁（owner 2026-09-30「其实就是圆角导致的」）', () => {
  const seam = buildSeamCss()
  const seamRules = seam.replace(/\/\*[\s\S]*?\*\//gu, '')
  // 宿主 = 卡的父元素；补丁 = 它上面的 ::after（最后一条，因为缺口补丁追加在缝挡板之后）。
  const HOST = ':has(> [data-composer-card]) {'
  const PATCH = ':has(> [data-composer-card])::after'
  const host = lastRuleWith(seam, HOST)
  const patch = lastRuleWith(seam, PATCH)

  it('必须挂在**卡的父元素**的 ::after 上 —— 卡片自己的 ::after 归官方虚线框', () => {
    // 官方「未选工作区」态用**卡片自己的 ::after** 画一圈虚线圆角框（构建产物实测：
    // content:"" + 1px 虚线 border + border-radius:var(--dsw-radius-panel) + absolute inset:0）。
    // 而 mask-image 作用于**整个伪元素**（含那条边框）⇒ 同处加 mask 会把官方虚线擦掉。
    // 父元素（官方 .root）的 ::before / ::after 实测两个相位都是 content:none ⇒ 无碰撞。
    //（本仓库同型先例：surface.ts 的 AFTER_LAYER_EXCLUDED_ANCHORS —— QueueDock 的 ::after 有官方描边，故回避。）
    assert.ok(patch.includes(PATCH), '补丁应挂在卡的父元素上')
    assert.ok(
      !seamRules.includes('[data-composer-card]::after'),
      '不得使用**卡片自己**的 ::after —— 那是官方的虚线圆角框（会被 mask 整圈擦掉）',
    )
    assert.ok(
      !seamRules.includes('[data-composer-card]::before'),
      '也不得用卡片的 ::before —— 那是本插件的玻璃层',
    )
  })

  it('宿主必须补成包含块且**无偏移 / 无 z-index**（与缝挡板同一纪律）', () => {
    assert.match(host, /position: relative/u, '父元素要 relative，绝对定位的补丁才有包含块')
    assert.ok(!/\btop\s*:/u.test(host) && !/\bleft\s*:/u.test(host), '宿主不得带偏移（不改布局）')
    assert.ok(!/\bz-index\s*:/u.test(host), '宿主不得带 z-index（那会另开层叠上下文）')
  })

  it('补丁的漆必须与座底那条**同源**：不透明 bg-base + 同源光 + 颗粒 + 单个 fixed', () => {
    // 复用的是同一个 backingPaint()：不透明 ⇒ 逐像素等于背景（C = P 精确成立），看不出补丁边界。
    assert.match(patch, /background-color: var\(--dsw-alias-bg-base\)/u, '必须不透明（原样 token）')
    assert.ok(patch.includes(`var(${GRAIN_TILE_VARIABLE}, none)`), '颗粒必须在（漏了它就是一块干净平色）')
    assert.ok(patch.includes(BACKDROP_GRADIENTS), '光必须与背景层**同源**（直引，不复制数值）')
    assert.match(patch, /background-attachment: fixed;/u, '必须单个 fixed（4 层 background-image）')
    assert.ok(!patch.includes('scroll, fixed'), '不得写 scroll, fixed（层数不足会被循环补齐）')
    assert.ok(!/\bbackground:\s/u.test(patch), '不得用 background 简写（会重置其它 background-*）')
  })

  it('形状只能靠 mask 的「瓦片减四分之一圆」——⛔ 不得写 border-radius', () => {
    // ⚠️ 这条是**实测反例**：写了 `border-radius: inherit` 会让补丁自己的背景按卡片那个 28px
    // 圆角被裁掉，而缺口恰好就在圆角**外面** ⇒ 补丁永远补不到（实测只从 123 降到 100，
    // 而不是 0）。形状必须**全部**交给 mask：底漆不透明，mask 之外全透明 ⇒
    // 不碰卡片面、不碰玻璃。
    assert.ok(!/border-radius/u.test(patch), '不得写 border-radius —— 会把补丁裁到弧线以内、补不到缺口')
    assert.match(patch, /mask-image: radial-gradient\(circle at/u, '形状必须由 radial-gradient 掩膜给出')
    assert.match(patch, /-webkit-mask-image: radial-gradient\(circle at/u, '必须同时给 -webkit- 前缀（Chromium 走它）')
    // 掩膜语义：距弧心 **> 半径** 才涂漆（弧线以外那块三角），弧线以内保持 transparent。
    assert.ok(
      !/transparent [^,)]*,\s*transparent/u.test(patch),
      '掩膜必须是「transparent → black」由内到外，写成反的会把卡片内部涂上漆',
    )
  })

  it('只补**上面两个角**（量出来的，不是省事）—— 下两角已被座底 46px 不透带盖住', () => {
    // 逐角实测（刷红量具 + 「藏正文」敏感度）：
    //   左上 123 / 右上 112 ⇒ 真的要补；左下 13 / 右下 10，且背后正文敏感度 0.00–0.04
    //   ⇒ 那不是用户可见的漏字（只是座底那条带 10px 过渡段的半透明读数），按纪律不补。
    const maskImage = /-webkit-mask-image:\s*([^;]+);/u.exec(patch)?.[1] ?? ''
    assert.equal(
      (maskImage.match(/radial-gradient\(/gu) ?? []).length,
      2,
      '掩膜应恰好两个瓦片（左上 + 右上），别顺手补四角',
    )
    // ⚠️ 逐条数**每个**掩膜属性的分量：只查 `mask-image` 会漏掉
    // 「只改 mask-position 补四角」这种变异（`-webkit-mask-position` 里也含 `mask-position`
    // 子串，用子串断言会假绿 —— 反向注入实测抓到过）。
    // ⚠️ 逗号必须按**括号深度 0** 切：分量里写着 `var(--dsw-radius-panel, 28px)`，
    // 那个逗号在括号内 —— 直接 split(',') 会把 2 个分量数成 6 个（本守卫初版就栽在这）。
    const topLevelCount = (value) => {
      let depth = 0
      let n = 1
      for (const ch of value) {
        if (ch === '(') depth += 1
        else if (ch === ')') depth -= 1
        else if (ch === ',' && depth === 0) n += 1
      }
      return n
    }
    for (const prop of ['mask-position', 'mask-size', 'mask-repeat']) {
      for (const decl of [`-webkit-${prop}`, prop]) {
        const values = new RegExp(`(?:^|[^-])${decl}:\\s*([^;]+);`, 'mu').exec(patch)?.[1]
        assert.ok(values, `缺声明 ${decl}`)
        assert.equal(
          topLevelCount(values),
          2,
          `${decl} 应恰好两个分量（左上 + 右上），实际 ${topLevelCount(values)} 个：${values}`,
        )
      }
    }
    assert.match(patch, /(?:^|[^-])mask-position: 0 0, 100% 0;/mu, '两个瓦片分别锚左上、右上')
    assert.match(patch, /(?:^|[^-])mask-repeat: no-repeat, no-repeat;/mu, '瓦片不得平铺（平铺会补满整张卡）')
    // 横向必须与卡片**同宽同左**：父元素是居中 flex 列，左缘 = 50% − 宽/2。
    assert.match(patch, /left: calc\(50% - min\(var\(--dsh-composer-card-max-width/u, '左缘按官方卡宽表达式居中')
    assert.ok(patch.includes(CARD_NOTCH_WIDTH), '宽度必须复用 CARD_NOTCH_WIDTH（与官方 .card 同源表达式）')
    // 高度只到圆角半径为止 —— 再高就会伸进卡片腹地。
    assert.ok(patch.includes(CARD_NOTCH_RADIUS), '高度与弧心必须取官方半径 token')
  })

  it('半径必须走官方 token，不得写死像素 —— 官方改半径时写死会静默错位成误伤', () => {
    assert.ok(CARD_NOTCH_RADIUS.includes('--dsw-radius-panel'), '半径应取官方 --dsw-radius-panel')
    assert.ok(CARD_NOTCH_RADIUS.includes('28px'), '应带 rc.2 实测兜底值')
    // ⚠️ 只允许**作为 token 兜底值**出现（`--dsw-radius-panel, 28px`），不许裸写 28px 当几何。
    // 裸写会在官方改半径时静默错位 —— 而这块补丁错位就是误伤（补丁伸进卡片 = 卡面被涂成背景色）。
    for (let at = seamRules.indexOf('28px'); at >= 0; at = seamRules.indexOf('28px', at + 1)) {
      const before = seamRules.slice(0, at).trimEnd()
      assert.ok(
        before.endsWith('--dsw-radius-panel,'),
        `28px 只能作为 --dsw-radius-panel 的兜底值出现，实际上下文：…${seamRules.slice(Math.max(0, at - 40), at + 4)}`,
      )
    }
  })

  it('门必须与缝挡板一致：官方默认让路 + 只 active（hero 不介入）', () => {
    for (const rule of [host, patch]) {
      const selector = rule.slice(0, rule.indexOf('{')).trim()
      assert.ok(selector.startsWith(`body:not([${PLAIN_ATTR}])`), `缺官方默认门：${selector}`)
      assert.ok(selector.includes("[data-phase='active']"), `只该覆盖 active：${selector}`)
    }
    assert.ok(!/hero/u.test(seam), 'hero 不介入（hero 下底座不是定位元素，补丁没有包含块）')
  })

  it('补丁必须压在卡片背后、不吃鼠标事件', () => {
    assert.match(patch, /z-index: -1/u, '补丁要画在卡片背后')
    assert.match(patch, /pointer-events: none/u, '补丁不得吃鼠标事件（卡里是输入框与按钮）')
    assert.match(patch, /position: absolute/u, '补丁要绝对定位到卡片顶')
    assert.match(patch, /top: 0/u, '卡片是父元素第一个在流子元素、父元素无上内边距 ⇒ 父元素顶就是卡片顶')
  })
})
