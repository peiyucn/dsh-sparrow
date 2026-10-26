/**
 * 抬升面（弹出来的框）的**表面绘制**：把背景层那套配方 —— 顶部光层 / 底部本色辉光 / 左侧金晕 —— 画到菜单与对话框上，让它们和整屏读成同一种材质；浮层是**面板**语义（一档比地面深、彼此统一的底色，分层靠描边 / 阴影 / hover 洗染）。
 * **两条通道同源但分工**：token 层（`tones.ts` 的 `POPUP_TOKENS`）**只给颜色**（role 有没有都算数）；本模块的选择器**给图形** —— 按 role / 官方锚点命中真正的浮层，底色仍读 {@link PANEL_VARIABLE}；「官方默认 = 完全不介入」⇒ 本表每条规则都带 `body:not([PLAIN_ATTR])` 前缀。
 * ⚠️ **图层不能塞进 token**：官方把同一个 `--dsw-specific-menu` 也用在 `position: sticky` 的分组标题小条上，而百分比渐变按元素盒子缩放 —— 一条 24px 的横条会把 `ellipse 120% 42%` 压成一道硬边金带。
 */

import { ANCHOR, anchorSelector } from './anchors.js'
import {
  BOTTOM_VARIABLE,
  DIALOG_ANCHOR,
  HOVER_CARD_ANCHOR,
  HOVER_CARD_TEXT_TOKENS,
  LEFT_VARIABLE,
  PANEL_VARIABLE,
  PLAIN_ATTR,
  POPUP_LIGHT_COMPENSATION,
  TOP_VARIABLE,
} from './constants.js'
import { POPUP_BOTTOM_SHAPE, POPUP_LEFT_SHAPE, POPUP_STOP, POPUP_TOP_SHAPE } from './constants.js'

/**
 * 浮层的**语义锚点表** —— 兜底通道：token 管不到的（自带硬编码底色的）弹层靠这几条（菜单族 / 命令面板 / 自带背景的 listbox / 各对话框 / 子代理弹层 / 后台任务列表 / 轮次导航预览卡 / 问答卡 / 计划审阅卡）。
 * ⚠️ **图片灯箱**被 `:not(:has(> img))` 排除（它的 `role='dialog'` 长在**整屏容器**上，染它 = 全屏糊一层金光），判据用 `> img` 而不是 `> [aria-hidden]`（后者**误伤了「token 消耗」那两个弹层**）；⚠️ **悬停卡不在本表**（见 {@link HOVER_CARD_ANCHOR}）—— 官方把这张卡的面与字都写死了，染面会让浅色轴变成「近白面 + 给深卡准备的浅字」= **白底白字**，故它走独立规则、面与字**一起**掰回主题。
 * ⚠️ **新增官方浮层时按同一判据核对**：① 有没有 role，没有就找它所在的官方槽位；② 面是不是**两轴同值**（同值 ⇒ 配的是固定字色 ⇒ 必须走恒深规则，别进本表）。宿主兼容：锚点全是官方公开属性、不碰 hashed 类名；失效只会让浮层退回官方 token 的面（纯观感），不进兼容门。
 */
export const SURFACE_ANCHORS: readonly string[] = Object.freeze([
  /**
   * ⛔ **菜单族整族不进本表**（2026-10-27，owner 报障 + 实测复核）。
   *
   * 此前收录过 `[role='menu']` / `[data-trigger-menu]` / 命令面板卡片（`listboxHost`）/ `[role='listbox']` 四条，
   * 用 `::after` 给菜单叠三道光。后果：
   * ① 官方 rc.3 菜单族已统一到 `MenuSurface`（`.material` 子层自带填充 + 模糊），我们再叠一层光就是**同一面画两份**；
   * ② 菜单**外壳**（`role='menu'`）与**内层列表**（`role='listbox'`）各自命中一条 ⇒ 同一个菜单里**内外两套光**，
   *    内层盒子比外壳小一圈（4px 内边距），正好读成「菜单里套着一个**淡框**」，hover 行底色一变就显形；
   * ③ token 层（`POPUP_TOKENS`）已经把官方菜单底色染成色调，观感不靠这层光。
   * 故菜单族**整族**交回官方材质 —— 不做「有的菜单打光、有的不打」的挑拣（那正是 2026-10-26 的老教训），
   * 而是**全族一致**。新增菜单类浮层时默认**不要**加进本表；只有「官方没给材质、又不带 role」的面才走这里。
   */
  /** **模态弹窗**（设置 / 云端文件 / 归档 …）—— **实色**，不做玻璃（缘由见 constants.ts 的 {@link DIALOG_ANCHOR}）。 */
  DIALOG_ANCHOR,
  /**
   * **子代理会话弹层**（`SubagentCatalogAction`，头部那枚「N subagents」按钮弹出的面板）—— 官方材质与后台任务弹层**逐字相同**，差别只在锚点表（jobs 那个 `<ul>` 有锚点、它没有 ⇒ 此前只有它没有颗粒与光）。结构是 outer（`createPortal` 直挂 body）> `[role='tree']`，故判据是「body 的哪个直接子元素含有 role=tree」（由 client half 算成锚点属性）。
   * ⚠️ `body >` 这层收窄**必须留着**：官方 `role='tree'` 有五处（本弹层、`JsonTree`、`WorkspaceBrowser` / `AnimatedRows`、左侧栏会话列表），后四者都是**内联 / 常驻**组件，裸写会把它们的背景换成不透明填充 + 光 + 颗粒 —— 那才是真事故。
   */
  `body > ${anchorSelector(ANCHOR.treeHost)}`,
  /**
   * **后台任务列表**（头部那枚任务数按钮弹出的 `<ul>`）—— 全表唯一**没有 role** 的锚点：那个 `<ul>` 只有
   * 本地化的 `aria-label`（不能当选择器），改用**它所在的官方槽位**锚定（`JobListAction` 声明自己渲染进
   * `conversation.session.header.actions`，`data-slot` 是官方公开契约）。
   */
  "body [data-slot='conversation.session.header.actions'] ul",
  /**
   * **轮次导航的预览卡**（`TurnNavigator` 那条右侧刻痕栏，悬停 / 聚焦某轮时弹出）。⚠️ 它和 `Tooltip` 的气泡都**不** portal 到 body（前者 `position: absolute` 长在 `<nav>` 里、后者源码明写 escape without a portal）⇒ 用 `body >` 收窄**一条都命不中**。
   * 用 `:not([data-side])` 排除 `Tooltip` 气泡：官方这枚气泡**总有** `data-side`（翻转用），且底色 `--dsw-alias-tooltip-bg` **两轴反色**、那是它的语义 —— 糊上夜色面板 + 颗粒会把气泡读成一个小菜单、反而丢掉可辨性（见 `tones.ts`「不染的几处（有意）」）。
   */
  "body [role='tooltip']:not([data-side])",
  /**
   * **问答卡**（`QuestionComposer`）—— 卡片本体只有 hashed 类名、没有 role，底色走 `--dsw-specific-input-major`（那条 token 我们**已经染过** ⇒ 颜色一直是对的，缺的只是质感）；判据用官方非哈希属性 `data-question-key` 收窄到它的**直接子元素**（卡片就在那一层）。
   * ⚠️ 用子选择器 `>` 而非后代：那棵子树里还有 `radiogroup` / `group` 等一堆后代容器，后代写法会给它们全叠图层。⚠️ 必须带 `body ` 前缀：`gatedAnchor()` 用 `replace(/^body\b/, …)` 把官方默认门并进去，少了前缀就**静默不替换** ⇒ 这条在官方默认档下也会生效，破坏「官方默认不动」的底线（本仓库为这条约定单设了测试）。
   */
  'body [data-question-key] > section',
  /** **计划审阅卡**（`PlanReviewPanel`）—— 与问答卡**同族同形**，只是钩子属性不同（`data-plan-review-key`）；
   *  两条分开写而不是合并成 `:is(...)`，是为了让每条锚点**单一来源**可读（将来可能只改其中一个）。 */
  'body [data-plan-review-key] > section',
  /**
   * **账号通知卡**（rc.2 新增 `AccountNoticeStack`）—— 前景卡是 `body` 层 portal 的 `<aside data-front>`，
   * 与其它抬升面同材质（只叠颗粒与光，底色走已染过的 `--dsw-specific-input-major`）。
   * 锚点打在它的父 stack 上（client half 算好，理由见 anchors.ts 的 `noticeStack`）：z-index 抬在 stack 上。
   * ⚠️ **只染前景卡**（`data-front='true'`）：更深层的卡是同一张卡的缩放副本，重复叠图层会把边缘压暗。
   */
  `body ${anchorSelector(ANCHOR.noticeStack)} > aside[data-front='true']`,
])

/** **实测为 `position: static` 的锚点** —— 只有这些才需要补 `position: relative`：`::after { position: absolute; inset: 0 }` 需要一个**定位祖先**当包含块，锚点若 `static` 且祖先链上也没有 positioned 元素，包含块会退到**视口** ⇒ 纹理铺满全屏（问答卡实测：卡内红点 0、卡外几乎全屏）。
 *  ⚠️ **绝不能给全表统一补**：本表多数锚点本来就是 `absolute` / `fixed`（菜单、气泡、弹层），盖一条 `relative` 会把绝对定位改成相对定位 ⇒ 弹层当场错位；新增锚点前先**实测**它的 computed `position`，确为 `static` 再登记。
 */
export const STATIC_SURFACE_ANCHORS: readonly string[] = Object.freeze([
  'body [data-question-key] > section',
  'body [data-plan-review-key] > section',
])


/** **输入框上方那三张停靠卡**（排队 / 目标 / 待办）—— 它们**不是浮层**，故单列一张表：三张卡与菜单族共享 `--dsw-specific-tip`，但按本模块的设计 **token 只给颜色**，而它们既没有 `role='menu'` 也没有 `role='dialog'` ⇒ 图形必须靠选择器。
 *  **画在带底色的那一层**（三张卡都是「外层 wrapper 无底色 + 内层自己带底色的面」）：`[data-queue-dock] > :first-child`（`.panel`）/ `[data-goal-bar] > :first-child`（`.bar`）/ `[data-testid='todo-panel']`（根元素自己）—— 都是官方公开属性，后者是那个 `<section>` 上唯一**非本地化**的稳定钩子（它的 `aria-label` 是 `t('todo.title')`，不能当选择器）；⚠️ **不能直接画在 wrapper 上**：wrapper 是整个停靠列的方框，会在面板圆角外露出直角。
 *  ⚠️ 它们也吃不到背景层的光：底座坐落在 `[data-conversation-scroll]`（z 81）**之上**，背景层（z 80）照不进来 —— 与顶栏 / 右栏同一条不变式：**凡抬到背景层之上、且自己有不透明底色的面，都得自己画一遍颗粒与光**。
 */
export const COMPOSER_CARD_ANCHORS: readonly string[] = Object.freeze([
  'body [data-queue-dock] > :first-child',
  'body [data-goal-bar] > :first-child',
  "body [data-testid='todo-panel']",
])

/** **不参与 `::after` 覆盖层**的锚点 —— 理由只有一条：**官方自己在同一个元素的 `::after` 上画了装饰**，我方再用同款伪元素就会把它顶掉或拽坏：QueueDock 的 `.panel::after` 是官方那条 `0.5px` 描边（我方把伪元素 `z-index` 压到 `-1` 会让描边进负 z 带、**被整行宽的悬停行底盖掉** —— ⚠️ 顶边仍在，**只抽样顶边的检查发现不了**）。
 *  ⚠️ **覆盖官方装饰必须记明**，故单列本表（一处是发丝线，不算「完全失效」）。@see usesAfterLayer
 */
export const AFTER_LAYER_EXCLUDED_ANCHORS: readonly string[] = Object.freeze([
  'body [data-queue-dock] > :first-child',
])

/** 被 {@link AFTER_LAYER_EXCLUDED_ANCHORS} 排除后，改往**官方自己的 `::before`** 补图层的锚点。为什么光靠「元素级那条」不够：QueueDock 的官方材质在它自己的 `.panel::before`（`z-index: -1` + `backdrop-filter`）上，而元素级 `background-image` 画在**元素背景层**、位于负 z 带**之下**，会被那层半透明材质连同模糊一起洗掉（实测 std 0.229 ≈ 纯色）。
 *  为什么补 `::before` 安全：官方那个伪元素**已经声明**了 `content: ''` 与完整几何 ⇒ 本表**只补 `background-image` 一个属性** —— 不动官方的盒子、质感压在官方材质之上（且**不经过**那个 `backdrop-filter`，它只过滤元素背后的东西）、**完全不碰 `::after`** ⇒ 官方描边照旧。
 *  ⚠️ **不得推广到别的锚点**：前提是「官方材质确实画在该元素自己的 `::before` 上、且官方已声明 `content`」；给官方**没有** `::before` 的元素补这条，会造出一个**无 content 的伪元素**（空转形态）。@see AFTER_LAYER_EXCLUDED_ANCHORS
 */
export const OFFICIAL_BEFORE_LAYER_ANCHORS: readonly string[] = Object.freeze([
  'body [data-queue-dock] > :first-child',
])

/** 该锚点是否要往**官方自己的 `::before`** 补图层（只补 `background-image`）。 */
export function usesOfficialBeforeLayer(anchor: string): boolean {
  return OFFICIAL_BEFORE_LAYER_ANCHORS.includes(anchor)
}

/** **锚点自身就是滚动容器**的那些面 —— 图层必须画在**元素级**，不能用 `::after`：`::after` 是 `position: absolute; inset: 0` 的伪元素、**在内容流里**，元素自己会滚时它会**随内容一起滚走**、只盖住「初始可见的那一屏」（实测 `scrollTop=0` 覆盖 95.6%、滚到底 **0.0%**；换成元素级 `background-image` 后 **99.2%**）。元素级不滚是因为 `background-attachment` 的**默认值 `scroll`** 对滚动容器就是「背景钉在元素自己的盒子上」（**切记不是 `local`** —— 那个才跟内容滚）。
 *  为什么不干脆全表改元素级：`::after` 是**负 z 层**，能压在官方**画在元素自己身上**的材质之上，而多数锚点**自己不滚**（真正的滚动容器是它们内部的 `.viewport`）⇒ 只给**自身是滚动容器**的锚点换成元素级，且**只换不加**（避免同一个面画两遍）；⚠️ 新增锚点时**必须实测它自己会不会滚**（`el.scrollHeight > el.clientHeight`），会滚就加进本表。@see usesAfterLayer
 */
export const OWN_BACKGROUND_ANCHORS: readonly string[] = Object.freeze([
  /** 后台任务列表：官方那个 `.menu` 自己就是滚动容器（`overflow: auto`）。 */
  "body [data-slot='conversation.session.header.actions'] ul",
])

/** 该锚点是否要把图层画在**元素级**（因为它自己就是滚动容器）。 */
export function usesOwnBackground(anchor: string): boolean {
  return OWN_BACKGROUND_ANCHORS.includes(anchor)
}

/** 该锚点是否要叠 `::after` 覆盖层（排掉官方占用了伪元素 / 自身是滚动容器的那些）。 */
export function usesAfterLayer(anchor: string): boolean {
  return !AFTER_LAYER_EXCLUDED_ANCHORS.includes(anchor) && !usesOwnBackground(anchor)
}


/** **输入框卡片里那两个圆形图标按钮**（`+` 命令面板 / 附件）—— 默认去掉底色、只保留 hover 底：官方给的默认底 `--dsw-specific-selector` 是**不透明实色**，而按钮坐在**玻璃卡片**里 ⇒ 读成两块贴在玻璃上的塑料片；官方默认态与 hover 态用的是**两个不同的 token**（后者 `--dsw-alias-interactive-bg-hover-solid`）⇒ 只把前者置为 `transparent` 即可，**hover 那条规则天然不受影响**、不必重写 hover、也不必跟特异度较劲。
 *  ⚠️ **覆盖范围仍然收在卡片里**（不写 `body`）：这 token 语义上是「选择器底色」，官方将来若给别的组件也接上，写 `body` 会误伤；收在卡片内则永不外溢。
 */
export const COMPOSER_ICON_BUTTON_SCOPE = 'body [data-composer-card]'

/** 浮层表面要叠的 `background-image` 图层，**从上到下**：① 顶部光层 / ② 底部本色辉光 / ③ **左侧金晕**（与背景层同一份配方，几何按浮层尺度缩小）。
 *  ⚠️ **必须是三道光**（背景层就是三道，同一个配方）：漏掉左光会让浮层与背景层「打光不一样」；⚠️ **每道光的强度都乘 {@link POPUP_LIGHT_COMPENSATION}**（压的是强度，几何与收束点不动）。全部走变量：缺变量时落到 `transparent` / `none` —— 即「官方默认」下等于什么都不画。
 *  ⚠️ 2026-10-22 起**不再有颗粒层**（原先是压在最上面的第 0 层）：浮层每多一层，打开菜单时都要多解析/栅格化一层。
 */
export function surfaceLayers(): string {
  return [
    `radial-gradient(${POPUP_TOP_SHAPE}, ${popupLight(TOP_VARIABLE)}, ${POPUP_STOP})`,
    `radial-gradient(${POPUP_BOTTOM_SHAPE}, ${popupLight(BOTTOM_VARIABLE)}, ${POPUP_STOP})`,
    `radial-gradient(${POPUP_LEFT_SHAPE}, ${popupLight(LEFT_VARIABLE)}, ${POPUP_STOP})`,
  ].join(',\n    ')
}

/** 三道光在**矮 / 窄面板**上的渐变盒子下限（px）—— 见 {@link SURFACE_LIGHT_GEOMETRY}。 */
export const LIGHT_MIN_BOX_PX = 120

/**
 * 三道光在**矮 / 窄面板**上的几何兜底：{:@link surfaceLayers} 用的是**百分比几何**（`ellipse 120% 42% at 50% -12%` 之类），
 * 按元素自身的盒子缩放 —— 这是设计（浮层的光随浮层尺度缩，见 spec 07）。但元素**矮到几十像素**时，顶光的纵向半径
 * 只有 `0.42 × 36 ≈ 15px`，"从上方来的光"会读成**贴着上缘的一条硬边亮带**：真机实测 710×36 的停靠卡，
 * 上缘 49.7 / 中部 44.3（Δ5.4），下缘同样有一条（Δ4.7）；而且面板高度一变（菜单加载分组、todo 更新条目）整条光重算，
 * 观感是「亮条在变/在闪」。
 *  做法：给每层渐变**盒子**一个下限（`max(100%, 120px)`）并把它锚回自己那条边（顶光贴顶 / 底光贴底 / 左光贴左）。
 *  ⚠️ 盒子不低于下限时（高面板）解析结果与 `auto` **逐层相同** —— 所以正常浮层零变化，只有矮/窄面板不被压成硬边。
 *  ⚠️ 逐层给值、且层数必须与 {@link surfaceLayers} 一致；`no-repeat` 不可省（盒子大于元素时默认 repeat 会平铺出接缝）。
 */
export const SURFACE_LIGHT_GEOMETRY = `background-size: 100% max(100%, ${LIGHT_MIN_BOX_PX}px), 100% max(100%, ${LIGHT_MIN_BOX_PX}px), max(100%, ${LIGHT_MIN_BOX_PX}px) max(100%, ${LIGHT_MIN_BOX_PX}px) !important;
  background-position: 50% 0%, 50% 100%, 0% 50% !important;
  background-repeat: no-repeat !important;`

/** 把一道光的运行期变量按 {@link POPUP_LIGHT_COMPENSATION} 压暗，供浮层图层串使用。
 *  用 `color-mix` 而不是改 alpha 数值：变量里是**任意合法颜色**（可能是 `rgba()` 也可能是 `transparent`），
 *  插件不该去解析它；`color-mix(in srgb, <色> k%, transparent)` 对任何颜色都成立，混出来仍是透明
 *  ⇒ 官方默认档下等于什么都不画。 */
function popupLight(variable: string): string {
  return `color-mix(in srgb, var(${variable}, transparent) ${Math.round(POPUP_LIGHT_COMPENSATION * 100)}%, transparent)`
}

/** 旧版「分组菜单」专用的图层串 —— **已废弃，保留仅为兼容导出**：只有底光一层，属「同族元素份数不一致」的遗留。
 *  ⚠️ 2026-10-26 起分组菜单的标题条整族交回官方（`MenuGroup` 自己做非吸顶透明 / 吸顶才上色），
 *  本函数**已无调用方**；保留是为了让旧导出（`src/index.ts` 有再导出）不突然消失，
 *  **不要再有新的调用方**；下一次大版本删除。
 *  @deprecated 用 {@link surfaceLayers} —— 每类表面都拿同样的三道光。
 */
export function menuSurfaceLayers(): string {
  return `radial-gradient(${POPUP_BOTTOM_SHAPE}, ${popupLight(BOTTOM_VARIABLE)}, ${POPUP_STOP})`
}


/** 给锚点挂上「官方默认」门 —— **必须把门并进锚点自己的 `body` 上**。
 *  ⚠️ **不能**写成 `body:not([…]) ${anchor}`：锚点自带 `body ` 前缀，那样会拼出 **body 套 body**、
 *  永远不可能命中（规则静默失效，只有走 token 的组件还留着质感，其余弹层全成了纯色）。 */
function gatedAnchor(anchor: string): string {
  return anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
}


/** 抬升面样式表文本（**只加质感，不刷底色**）—— 底色与模糊全部交回官方：官方已把菜单族统一成「半透明 + 模糊」，本插件再刷一遍就是画两遍（官方画在元素自己身上的那类是同值覆盖、无碍，但官方画在 `::before` 上的那些会**叠两次同色 ⇒ 等效 0.75**，看着不透明），故一个材质声明都不写，官方材质原样生效；色调只走 `tones.ts` 的 `POPUP_TOKENS` 染进官方 token（官方接入方式）。
 *  仍然保留 `!important`：官方写的是 `background:` **简写**（内含 `background-image: none`）、特异度又各写各的，压不过就是静默失效。
 *  @returns 注入 `<style>` 的 CSS 文本。 */
export function buildSurfaceCss(): string {
  return `/* ===== dsh-theme-tone 抬升面（菜单 / 对话框）：只叠质感、底色交回官方；选择器带 ${PLAIN_ATTR} 门 ===== */
/* --- 图层：**::after 单载体**（同一个面画两份会让份数取决于官方组件有没有 z-index:-1 的材质子元素，观感不可预测）--- */
${SURFACE_ANCHORS.filter(usesAfterLayer).map(anchor => `${gatedAnchor(anchor)}::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background-image: ${surfaceLayers()} !important;
  ${SURFACE_LIGHT_GEOMETRY}
  pointer-events: none;
}`).join('\n')}
/* --- 自身是滚动容器的锚点：图层改画在**元素级**（::after 会随内容滚走，滚出来的部分没有质感；只换载体、不保留 ::after）--- */
${SURFACE_ANCHORS.filter(usesOwnBackground).map(anchor => `${gatedAnchor(anchor)} {
  background-image: ${surfaceLayers()} !important;
  ${SURFACE_LIGHT_GEOMETRY}
}`).join('\n')}
/* --- 让锚点自己**形成层叠上下文**：否则 ::after 的 z-index:-1 会逃逸到父层、被元素自身的不透明背景盖住 --- */
${SURFACE_ANCHORS.filter(usesAfterLayer).map(anchor => `${gatedAnchor(anchor)} {
  isolation: isolate;
}`).join('\n')}
/* --- 让 static 锚点成为 ::after 的**包含块**（否则 inset:0 的包含块退到视口、纹理铺满全屏）；只给 STATIC_SURFACE_ANCHORS 里那几个补 --- */
${STATIC_SURFACE_ANCHORS.filter(usesAfterLayer).map(anchor => `${gatedAnchor(anchor)} {
  position: relative;
}`).join('\n')}
/* --- QueueDock：官方占用了它自己的 ::after（0.5px 描边），故改补到官方自己的 ::before —— 只补 background-image 一个属性，官方伪元素的 content 与几何原样不动 --- */
${SURFACE_ANCHORS.filter(usesOfficialBeforeLayer).map(anchor => `${gatedAnchor(anchor)}::before {
  background-image: ${surfaceLayers()} !important;
}`).join('\n')}
/* --- 菜单族：**不再由我们声明填充与模糊**（官方已到处成对画好；再刷一遍会让画在 ::before 上的那些叠两次同色 = 等效 75%）--- */
/* --- 输入框上方那三张**停靠卡**（排队 / 目标 / 待办）：锚点与「为什么画在子元素上」见 COMPOSER_CARD_ANCHORS ---
   ⚠️ **只写图层、不写底色**：底色归卡片自己的 token（--dsw-specific-tip，内嵌面通道）—— 面板变量是**抬升面**的色，拿它当底色会把三张卡的面盖成纯白。
   ⚠️ 用 ::after + z-index:-1（官方这几张卡的材质画在**伪元素**上，会盖住元素级图层）；QueueDock 的 ::after 被官方描边占用 ⇒ 它改补**官方自己的 ::before**（只补 background-image）。 --- */
${COMPOSER_CARD_ANCHORS.filter(usesOfficialBeforeLayer).map(anchor => `${gatedAnchor(anchor)}::before {
  background-image: ${surfaceLayers()} !important;
}`).join('\n')}
${COMPOSER_CARD_ANCHORS.filter(usesAfterLayer).map(anchor => `${gatedAnchor(anchor)}::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background-image: ${surfaceLayers()} !important;
  ${SURFACE_LIGHT_GEOMETRY}
  pointer-events: none;
}`).join('\n')}
/* 同 SURFACE_ANCHORS：让这几张卡也**自己成层叠上下文**，否则 ::after 的 z-index:-1 会逃逸到父层、被卡片自己的背景盖住。 */
${COMPOSER_CARD_ANCHORS.filter(usesAfterLayer).map(anchor => `${gatedAnchor(anchor)} {
  isolation: isolate;
}`).join('\n')}
/* --- 为什么**不**改这三张卡的几何：缝是官方的（QueueDock 收掉间距贴住输入框，todo / goal 保留官方 6px 间距），
   本插件只是关掉了底座背衬才让它显形 —— 真要处理该动**底座背衬**那条，不是卡片几何。
   颜色也不能拿来代替间距：颜色标记单个东西的身份，**分组边界只有几何能表达**。 --- */
/* --- 输入框卡片里的**圆形图标按钮**（+ 命令 / 附件）：默认去底、保留 hover 底（缘由见 COMPOSER_ICON_BUTTON_SCOPE）--- */
${gatedAnchor(COMPOSER_ICON_BUTTON_SCOPE)} {
  --dsw-specific-selector: transparent;
}
/* --- 悬停卡：官方把**面和字都写死了**（两轴同值），这里跟随主题 —— 全插件**四条不带官方默认门的规则之一**
   （两个档都修，缘由见 constants.ts 的 HOVER_CARD_ANCHOR）；面走 ${PANEL_VARIABLE}，官方默认档下正是官方自己的 layer3。 --- */
${HOVER_CARD_ANCHOR} {
  /* ⚠️ 这条规则不带门 ⇒ token 层未就绪（loading 窗口 / overrideTokens 抛错重试之前）时它也照常生效，
     故面板色必须给**官方兜底**：没有兜底时 var() 解析为空、卡片会变成**全透明**，比不生效更糟；
     兜底取官方 layer-3 —— 正是「这个档下本来该有的那个面」。（本段不能出现反引号与色值字面量。） */
  background-color: var(${PANEL_VARIABLE}, var(--dsw-alias-bg-layer-3)) !important;
  background-image: ${surfaceLayers()} !important;
  ${SURFACE_LIGHT_GEOMETRY}
}
/* 字色：官方写死的浅字必须一起换成**主题感知**的 label token（否则浅卡配浅字仍是白底白字），按稳定后缀匹配。 */
${HOVER_CARD_TEXT_TOKENS.map(({ suffix, token }) => `${HOVER_CARD_ANCHOR} [class*='${suffix}'] {
  color: var(${token}) !important;
}`).join('\n')}
/* --- 模态弹窗**不做玻璃**：它是内容面（列表 / 卡片 / 表格），与上面那批同一套实色抬升面；玻璃只留给控制层的**输入框**。 --- */
`
}
