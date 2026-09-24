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
  SEAT_SOLID_PX,
  SEAT_SOLID_RAMP_PX,
  SHADE_ALPHA,
  buildGlassCss,
  phaseGate,
} from '../lib/glass.js'
/** 浅色轴暗边用的官方最深静态色 token。 */
const SHADE_TOKEN = '--dsw-static-neutral-bluish-1000'
import { ABOVE_CONTENT_Z_INDEX, CONTENT_Z_INDEX, GRAIN_TILE_VARIABLE, PLAIN_ATTR, RIGHT_PANEL_ATTR, SIDE_ATTR, WIDTH_HANDLE_ATTR, WORKSTART_ATTR } from '../lib/constants.js'
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
 * 故定位用**选择器组的首行**（`[data-sidebar-right-panel],`），不能写成
 * `[data-sidebar-right-panel] {`（那个串已不存在）。
 * @param source - 已剥注释的样式表文本。
 * @returns 该规则的起始下标（找不到为 -1）。
 */
function rightPanelRuleStart(source) {
  return source.indexOf(`[${RIGHT_PANEL_ATTR}],`)
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
    assert.match(
      css,
      new RegExp(`\\[data-conversation-scroll\\][\\s\\S]*?padding-top: ${HEADER_HEIGHT_PX}px`, 'u'),
      '③ 滚区顶部要补出顶栏高度',
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

  it('顶栏应该 **自己画一遍背景层的渐变栈**，且按自己的填充 alpha 同步压光', () => {
    // 背景层（80）原本压在顶栏之上，顶光是**直接盖在顶栏上**的；顶栏为躲开内容抬到 82 后
    // 就吃不到了（owner：「怎么顶栏的金光没有了」）。所以要自己画一遍，且必须**同源**。
    // ⚠️ 光还要按顶栏自己的填充 alpha 同步压：底乘 70%、光却是满的 → 那一片比周围亮一截
    //（owner 对底座那处说的「相当于两层光了」是同一个毛病，顶栏半透明同样逃不掉）。
    // 锚点用 0.1.7 起的那条（conversation.header > header）—— 见本文件顶部的结构对照。
    // ⚠️ 2026-09-24 起玻璃挂 **::before**（本体不许带 backdrop-filter，见下面那条守护）。
    const header = rulesFor(css, "[data-slot='conversation.header'] > header::before").join('\n')
    assert.ok(header.length > 0, '顶栏玻璃层（::before）应存在')
    assert.ok(header.includes(dimmedBackdropGradients(GLASS_HEADER_ALPHA)), '顶栏的光必须按同一 alpha 压')
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
    const decl = (prop) => {
      const m = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'u'))
      assert.ok(m, `${prop} 缺失`)
      return m[1].split(',').map(s => s.trim())
    }
    assert.equal(decl('background-size').length, 3, 'background-size 必须 3 个值（= 层数）')
    assert.equal(decl('background-position').length, 3, 'background-position 必须 3 个值（= 层数）')
    assert.equal(decl('background-repeat').length, 3, 'background-repeat 必须 3 个值（= 层数）')
    // 三段渐变的盒子尺寸必须是**显式视口尺寸**（auto 会让盒宽随 regime 变）
    assert.deepEqual(decl('background-size'), ['100vw 100vh', '100vw 100vh', '100vw 100vh'],
      '三段渐变必须显式 100vw 100vh')
    // 渐变右对齐（右缘 = 视口右缘）
    assert.deepEqual(decl('background-position'), ['right top', 'right top', 'right top'],
      '三段渐变右对齐')
    assert.deepEqual(decl('background-repeat'), ['no-repeat', 'no-repeat', 'no-repeat'])
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
    const card = cardRule(css)
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
    const card = cardRule(css)
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
    const blocks = rules.split('}').filter(block => block.includes('{'))
    for (const block of blocks) {
      const selector = block.slice(0, block.indexOf('{')).trim()
      if (selector === '' || EXEMPT.some(e => selector.includes(e)) || selector.includes(CARD)) continue
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
    assert.match(block, new RegExp(`opacity:\\s*${GRAIN_OPACITY}`, 'u'), '深色轴 opacity 必须等于背景层')
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
      new RegExp(`opacity:\\s*${GRAIN_OPACITY_LIGHT}`, 'u'),
      '浅色轴 opacity 必须等于背景层的 GRAIN_OPACITY_LIGHT',
    )
    // ⚠️ ::after 需要包含块，而官方 .tabHost / .emptyTabHost 是 static —— 必须补 position
    const rpStart = rightPanelRuleStart(rules)
    const rpRule = rules.slice(rpStart, rules.indexOf('}', rpStart))
    assert.match(rpRule, /position:\s*relative/u, '宿主必须补 position: relative 给 ::after 当包含块')
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
})
