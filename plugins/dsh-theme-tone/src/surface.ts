/**
 * 抬升面（弹出来的框）的**表面绘制**：把背景层那套配方 —— 顶部光层 / 底部本色辉光 / 颗粒 —— 画到菜单与对话框上，让它们和整屏读成同一种材质；浮层是**面板**语义（一档比地面深、彼此统一的底色，分层靠描边 / 阴影 / hover 洗染）。
 * **两条通道同源但分工**：token 层（`tones.ts` 的 `POPUP_TOKENS`）**只给颜色**（role 有没有都算数）；本模块的选择器**给图形** —— 按 role / 官方锚点命中真正的浮层，底色仍读 {@link PANEL_VARIABLE}；「官方默认 = 完全不介入」⇒ 本表每条规则都带 `body:not([PLAIN_ATTR])` 前缀。
 * ⚠️ **图层不能塞进 token**：官方把同一个 `--dsw-specific-menu` 也用在 `position: sticky` 的分组标题小条上，而百分比渐变按元素盒子缩放 —— 一条 24px 的横条会把 `ellipse 120% 42%` 压成一道硬边金带。
 */

import { grainOverGradients } from './backdrop.js'
import { ANCHOR, anchorSelector } from './anchors.js'
import {
  BOTTOM_VARIABLE,
  DIALOG_ANCHOR,
  GRAIN_TILE_VARIABLE,
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
  /** **菜单族**（含带分组标题的模型选择器）。全量收录：把带分组的菜单排除出去会让它只剩一个不透明色
   *  = 「纯色」；横带问题由 {@link GROUPED_MENU_SELECTOR} / {@link groupTitleLayers} 那套专门解决。 */
  "body [role='menu']",
  /**
   * **命令面板 / 输入触发菜单**。
   * ⚠️ **必须排除 `[data-overflow-below]`**：该状态下官方**自己**用同一个 `::after` 画「下面还有内容」
   * 的渐隐提示，而两个属性打在**同一个元素**上 —— 我方那条 `::after` 会把官方提示**整个顶掉**。
   * 代价明确：该状态下这一处没有我们的质感（官方提示优先）。
   */
  "body [data-trigger-menu]:not([data-overflow-below])",
  /**
   * **命令面板的卡片** —— 背景长在**祖先**上、`role` 在内层视口上，所以判据是「谁的直接子元素是 listbox」，
   * 由 client half 算好写成**锚点属性**（`listboxHost`；不用 `:has()`，开销见 docs/spec/11）。
   * ⚠️ **不给它加宿主收窄**：那个祖先是官方自建的卡片、不带任何标记，加前缀会漏掉真正要染的那张卡。
   */
  `body ${anchorSelector(ANCHOR.listboxHost)}`,
  "body [role='listbox']:not([data-trigger-menu] *)",
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
])

/** **实测为 `position: static` 的锚点** —— 只有这些才需要补 `position: relative`：`::after { position: absolute; inset: 0 }` 需要一个**定位祖先**当包含块，锚点若 `static` 且祖先链上也没有 positioned 元素，包含块会退到**视口** ⇒ 纹理铺满全屏（问答卡实测：卡内红点 0、卡外几乎全屏）。
 *  ⚠️ **绝不能给全表统一补**：本表多数锚点本来就是 `absolute` / `fixed`（菜单、气泡、弹层），盖一条 `relative` 会把绝对定位改成相对定位 ⇒ 弹层当场错位；新增锚点前先**实测**它的 computed `position`，确为 `static` 再登记。
 */
export const STATIC_SURFACE_ANCHORS: readonly string[] = Object.freeze([
  'body [data-question-key] > section',
  'body [data-plan-review-key] > section',
])

/** 带**粘性分组标题**的菜单（官方 `ModelSelect` / 本仓库 codebuddy 的模型选择器）—— 定案是**只去掉顶光**：全给会让顶光在「正好压在菜单顶部」的分组标题那一栏显形（**横带就是它造的**），全不给又只剩一个不透明色（「纯色」）；**颗粒**要给（均匀贴图，与盒子高度无关）、**底光**要给（锚在盒子底部，与永远吸在顶部的标题不相遇、留着才有纵深）。
 *  ⚠️ **颗粒也要给分组标题条本身**（见 {@link GROUPED_MENU_TITLE_SELECTOR} / {@link groupTitleLayers}）：标题自己刷了**不透明地面色**当底、再把卡片那一摞层重画 ⇒ 不补就是把卡片那片颗粒挖掉一块、露出「平带」；判据不是「要不要给标题颗粒」，而是**标题上有没有不透明底**。
 */
export const GROUPED_MENU_SELECTOR = `body ${anchorSelector(ANCHOR.menuGrouped)}`

/** {@link GROUPED_MENU_SELECTOR} 的**无守卫写法**，专供「与后代锚点组合」的规则使用 —— 去掉的 `:has([role='group'])` 是**冗余守卫**（组合规则的后半段本身就已要求「命中元素是某个 `[role='group']` 的后代 / 那个 group 本身」⇒ **严格等价，不是近似**）；实测规则条数与开销无关、成本集中在 `:has()` 上，只去掉这几处重复守卫就省约 18% 的样式重算且不改观感。
 *  ⚠️ **单独使用**（给菜单本体上料那条）必须保留 `:has()` —— 那里没有别的锚点能表达「这是个带分组的菜单」。
 */
export const GROUPED_MENU_UNGUARDED_SELECTOR = "body [role='menu']"

/** 分组标题条：`<section role='group'>` 里的**标题元素**，用**结构 / 公开锚点**定位、不碰 hashed 类名（`[class*='_groupTitle']` 还得额外照顾 codebuddy 那个非哈希类名，且官方一改名就失效）。
 *  ⚠️ **两种结构都要覆盖**：旧结构（官方 `ModelSelect` / codebuddy）标题是 `[role='group']` 的**第一个子元素**；新结构（官方抽出的 `MenuGroup` 原语）标题带公开属性 **`data-menu-group-heading`**，且标题**前面**插了一个 1×1 隐形哨兵 `data-menu-group-start`（供观测吸顶）—— 只写 `:first-child` 会打在那个哨兵上，真正的标题条拿不到图层、官方吸顶色会直接压在我们染过色的菜单上（横带回来）。
 *  ⚠️ **必须是单个复合选择器，不能写成逗号列表**：本常量是**后代片段**，由 {@link groupTitleRule} 拼在 {@link GROUPED_MENU_UNGUARDED_SELECTOR} 之后 —— 逗号会在拼接处切开整条规则，后半段丢掉 body 前缀与色调门、静默生效到全站；故两个结构用 `:is()` 合并（两参数特异度同为 (0,1,0)，取最大值 ⇒ 与改前一致）。
 */
export const GROUPED_MENU_TITLE_SELECTOR =
  "[role='group'] > :is(:first-child, [data-menu-group-heading])"

/** **输入框上方那三张停靠卡**（排队 / 目标 / 待办）—— 它们**不是浮层**，故单列一张表：三张卡与菜单族共享 `--dsw-specific-tip`，但按本模块的设计 **token 只给颜色**，而它们既没有 `role='menu'` 也没有 `role='dialog'` ⇒ 图形必须靠选择器。
 *  **画在带底色的那一层**（三张卡都是「外层 wrapper 无底色 + 内层自己带底色的面」）：`[data-queue-dock] > :first-child`（`.panel`）/ `[data-goal-bar] > :first-child`（`.bar`）/ `[data-testid='todo-panel']`（根元素自己）—— 都是官方公开属性，后者是那个 `<section>` 上唯一**非本地化**的稳定钩子（它的 `aria-label` 是 `t('todo.title')`，不能当选择器）；⚠️ **不能直接画在 wrapper 上**：wrapper 是整个停靠列的方框，会在面板圆角外露出直角。
 *  ⚠️ 它们也吃不到背景层的光：底座坐落在 `[data-conversation-scroll]`（z 81）**之上**，背景层（z 80）照不进来 —— 与顶栏 / 右栏同一条不变式：**凡抬到背景层之上、且自己有不透明底色的面，都得自己画一遍颗粒与光**。
 */
export const COMPOSER_CARD_ANCHORS: readonly string[] = Object.freeze([
  'body [data-queue-dock] > :first-child',
  'body [data-goal-bar] > :first-child',
  "body [data-testid='todo-panel']",
])

/** **不参与 `::after` 覆盖层**的锚点 —— 理由只有一条：**官方自己在同一个元素的 `::after` 上画了装饰**，我方再用同款伪元素就会把它顶掉或拽坏：QueueDock 的 `.panel::after` 是官方那条 `0.5px` 描边（我方把伪元素 `z-index` 压到 `-1` 会让描边进负 z 带、**被整行宽的悬停行底盖掉** —— ⚠️ 顶边仍在，**只抽样顶边的检查发现不了**）；`[data-trigger-menu][data-overflow-below]` 的 `::after` 是「下面还有内容」的渐隐提示（我方 `background-image` 会把它整个顶掉，该锚点已用 `:not([data-overflow-below])` 收窄）。
 *  ⚠️ **覆盖官方装饰必须记明**，故单列本表（一处是发丝线、一处是提示带，不算「完全失效」）。@see usesAfterLayer
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

/** 浮层表面要叠的 `background-image` 图层，**从上到下**：① 颗粒（色调关了 `grain` 时是 `none`）—— 压在最上面才像砂面；② 顶部光层 / ③ 底部本色辉光 / ④ **左侧金晕**（与背景层同一份配方，几何按浮层尺度缩小）。
 *  ⚠️ **必须是三道光**（背景层就是三道，同一个配方）：漏掉左光会让浮层与背景层「打光不一样」；⚠️ **每道光的强度都乘 {@link POPUP_LIGHT_COMPENSATION}**（压的是强度，几何与收束点不动）。全部走变量：缺变量时落到 `transparent` / `none` —— 即「官方默认」下等于什么都不画。
 */
export function surfaceLayers(): string {
  return [
    `var(${GRAIN_TILE_VARIABLE}, none)`,
    `radial-gradient(${POPUP_TOP_SHAPE}, ${popupLight(TOP_VARIABLE)}, ${POPUP_STOP})`,
    `radial-gradient(${POPUP_BOTTOM_SHAPE}, ${popupLight(BOTTOM_VARIABLE)}, ${POPUP_STOP})`,
    `radial-gradient(${POPUP_LEFT_SHAPE}, ${popupLight(LEFT_VARIABLE)}, ${POPUP_STOP})`,
  ].join(',\n    ')
}

/** 把一道光的运行期变量按 {@link POPUP_LIGHT_COMPENSATION} 压暗，供浮层图层串使用。
 *  用 `color-mix` 而不是改 alpha 数值：变量里是**任意合法颜色**（可能是 `rgba()` 也可能是 `transparent`），
 *  插件不该去解析它；`color-mix(in srgb, <色> k%, transparent)` 对任何颜色都成立，混出来仍是透明
 *  ⇒ 官方默认档下等于什么都不画。 */
function popupLight(variable: string): string {
  return `color-mix(in srgb, var(${variable}, transparent) ${Math.round(POPUP_LIGHT_COMPENSATION * 100)}%, transparent)`
}

/** {@link GROUPED_MENU_SELECTOR} 专用的图层串 —— **已废弃，保留仅为兼容导出**：它只有 2 层
 *  （颗粒 + 底光），是「同族元素份数不一致」的来源。现在统一走 {@link surfaceLayers}（4 层）。
 *  保留是为了让旧导出（`src/index.ts` 有再导出）不突然消失，**不要再有新的调用方**；下一次大版本删除。
 *  @deprecated 用 {@link surfaceLayers} —— 每类表面都拿同样的 4 层。
 */
export function menuSurfaceLayers(): string {
  return [
    `var(${GRAIN_TILE_VARIABLE}, none)`,
    `radial-gradient(${POPUP_BOTTOM_SHAPE}, ${popupLight(BOTTOM_VARIABLE)}, ${POPUP_STOP})`,
  ].join(',\n    ')
}

/** 菜单填充色变量 —— 标题条与卡片**必须读同一个**，否则标题就是一条色差带。
 *  官方把菜单表面填充收进 `--dsw-menu-surface-fill`，而 `--dsw-specific-menu` 是它的**别名**
 *  （值同源）；两个名字都染（见 `POPUP_TOKENS`），这里优先读语义更准的那个、并留别名兜底。 */
const MENU_FILL = `var(--dsw-menu-surface-fill, var(--dsw-specific-menu))`

/** 粘性分组标题条的 `background-image`，**从上到下**：① **卡片自己的颗粒**（满强度，卡片就把它画在
 *  最上层）② **卡片填充**（与卡片同一个 token、同一个 alpha）③ **地面原样重画**（{@link grainOverGradients}：
 *  颗粒 + 三段光，`fixed` 对齐视口）—— 卡片是玻璃，它看到的就是「地面」这四层，标题另有不透明底，
 *  不重画就丢了「地面长什么样」。
 *  合成结果 = 颗粒 叠在（填充 叠在 地面 上）—— 与卡片**逐层同源**（实测两轴都在 1 级以内）。 */
export function groupTitleLayers(): string {
  return [
    `var(${GRAIN_TILE_VARIABLE}, none)`,
    `linear-gradient(${MENU_FILL}, ${MENU_FILL})`,
    grainOverGradients(),
  ].join(',\n    ')
}

/** {@link groupTitleLayers} 的**逐层 `background-attachment`**：最上面两层（标题自己的颗粒、卡片填充）
 *  按元素盒子，地面那四层 `fixed` —— 地面是整屏 `position: fixed` 层、百分比按**视口**解析；少了 `fixed`，
 *  一条 26px 的横条会把 `ellipse 80vw 45vh` 压成硬边带。
 *  ⚠️ **值必须逐层给足**：CSS 在值少于层数时是**整串重复**，只写三个会让第 4、5 层回到 `scroll`、光层被压扁。 */
export const GROUP_TITLE_ATTACHMENT = 'scroll, scroll, fixed, fixed, fixed, fixed'

/** 分组菜单的**滚动容器**（分组标题的吸顶上下文）—— 菜单卡片里那个装着全部 `[role='group']` 的盒子，用**结构**锚定：官方 `ModelSelect` 是 `div.groups`、本仓库 codebuddy 是 `div.ccb-model-groups`，两者都是菜单卡片的直接子元素（不碰 hashed 类名）。
 *  ⚠️ 本常量是**后代片段**（以组合符开头，与 {@link GROUPED_MENU_TITLE_SELECTOR} 同类），使用时拼在菜单锚点之后 —— **不能**写成 `:scope > …`：`:scope` 在**样式表**里没有上下文引用元素、按规范退化成 `:root` ⇒ 规则静默失效。官方改版后 `role='menu'` 搬到了内层滚动容器上，故本常量只覆盖「卡片还是菜单锚点」的那一半，另一半见 {@link GROUPED_MENU_SELF_SCROLLER_SUFFIX}。
 */
export const GROUPED_MENU_SCROLLER_SELECTOR = `> ${anchorSelector(ANCHOR.menuChild)}`

/** 滚动容器**就是菜单锚点自己**时的**后缀片段**（无组合符，直接贴在菜单锚点后）—— 官方改版把 `role='menu'` **从卡片搬到了内层滚动容器**上，「菜单锚点的直接子元素」这个关系**整体上移了一层** ⇒ `[role='menu'] > :has([role='group'])` 在新结构下**一条也命不中**（实测新结构 0 命中 / 旧结构 1 命中）、内圈圆角静默失效。
 *  本后缀问「**自己**的直接子里有 group」：新结构的滚动容器直接子正是 `section[role='group']` ⇒ 命中；旧结构的卡片与 codebuddy 菜单的直接子都是普通 `div` ⇒ 不命中，不会与 {@link GROUPED_MENU_SCROLLER_SELECTOR} 那条在同一元素上叠着写。
 *  ⚠️ 两条腿**必须各出一条规则**，不能合并进一个 `:is()`：`:is()` 里的相对选择器无法表达「锚点自己」，合并会把新结构那一半又弄丢。
 */
export const GROUPED_MENU_SELF_SCROLLER_SUFFIX = anchorSelector(ANCHOR.menuSelfScroller)

/** 「分组菜单**内圈**圆角」的自定义属性名 —— {@link GROUPED_MENU_SCROLLER_RADIUS} 经它取值。
 *  同心圆角 = **菜单自己的外圆角 − 菜单自己的内边距**，而各菜单外圆角不同（官方 16 ⇒ 12；
 *  codebuddy 20 ⇒ 16），可滚动容器那条规则**同时命中两个菜单** ⇒ 半径写死在规则里必然让其中一个错掉。
 *  做法：规则只读变量、**默认值是官方菜单的同心值**；菜单所有者在自己菜单元素上覆盖它
 *  （自定义属性沿继承树向下传，滚动容器是菜单的后代 ⇒ 各自读到各自的值）。
 *  ⚠️ **命名带插件前缀**：明确「谁写的、谁能覆盖」，也不会与官方未来可能的同名变量撞车。 */
export const GROUPED_MENU_INNER_RADIUS_VARIABLE = '--dsh-theme-tone-menu-inner-radius'

/** 分组标题条的圆角：**0**（方角）—— 标题条一旦自己有圆角，缺口里就会露出滚动的行（**几何必然**，
 *  与半径大小、配色无关），所以圆角**改由滚动容器承担**（见 {@link GROUPED_MENU_SCROLLER_RADIUS}）。
 *  ⚠️ 保留这个常量（而不是在规则里裸写 `0`）是为了让「圆角归零」这件事在一处可读、可断言。 */
export const GROUP_TITLE_RADIUS = '0'

/** **圆角写在滚动容器上，不写在标题条上**：容器顶角的裁剪**同时作用于条与行** ⇒ 那里既没有条、也没有行，露出的是**菜单自己的玻璃**（与卡片同源，不用猜颜色），条自己保持方角 ⇒ **结构上不可能漏**；半径取**同心值** = 菜单外圆角 − 内边距（官方 `--dsw-radius-lg` 16 − 4 = 12 = `--dsw-radius-md`；codebuddy 20 − 4 = 16），而本规则**同时命中两个菜单** ⇒ 只能经 {@link GROUPED_MENU_INNER_RADIUS_VARIABLE} 间接取值、默认给官方菜单的同心值。
 *  右上角**多补一个滚动条宽**：行的右边缘在容器的**内容盒**上（比 border-box 右缘靠左一个滚动条宽），同半径下右角弧线会浅一截；已知取舍：内容不溢出（无滚动条）时右角比同心值深 5px —— CSS 里判不出滚动条有无，而两个方向的偏差都落在「条与卡片」边界上（实测只差 0.7 级，肉眼不可辨）。
 *  ⚠️ **切圆不改变填充**：条的不透明底照旧（见 {@link groupTitleLayers}）。 */
export const GROUPED_MENU_SCROLLER_RADIUS =
  `var(${GROUPED_MENU_INNER_RADIUS_VARIABLE}, var(--dsw-radius-md, 12px)) ` +
  `calc(var(${GROUPED_MENU_INNER_RADIUS_VARIABLE}, var(--dsw-radius-md, 12px)) + var(--dsh-scrollbar-width, 5px)) 0 0`

/** 给锚点挂上「官方默认」门 —— **必须把门并进锚点自己的 `body` 上**。
 *  ⚠️ **不能**写成 `body:not([…]) ${anchor}`：锚点自带 `body ` 前缀，那样会拼出 **body 套 body**、
 *  永远不可能命中（规则静默失效，只有走 token 的组件还留着质感，其余弹层全成了纯色）。 */
function gatedAnchor(anchor: string): string {
  return anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
}

/** 分组标题条规则的**选择器构造**：把 {@link GROUPED_MENU_UNGUARDED_SELECTOR} 自带的 `body ` 前缀换成
 *  调用方给的前缀（要带门 / 还要带轴门）—— 与 {@link gatedAnchor} 是同一个坑的另一种解法
 *  （那里把门并进锚点，这里换前缀）；直接拼会拼出 **body 套 body**、规则静默失效。 */
function groupTitleRule(bodyPrefix: string): string {
  // ⚠️ 用**无守卫**锚点：组合规则的后半段已经要求 `[role='group']` 的存在，`:has()` 是冗余的，
  // 而它每次 DOM 变动都要重匹配。等价性与收益见 {@link GROUPED_MENU_UNGUARDED_SELECTOR}。
  return `${bodyPrefix} ${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\s+/u, '')} ${GROUPED_MENU_TITLE_SELECTOR}`
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
  pointer-events: none;
}`).join('\n')}
/* --- 自身是滚动容器的锚点：图层改画在**元素级**（::after 会随内容滚走，滚出来的部分没有质感；只换载体、不保留 ::after）--- */
${SURFACE_ANCHORS.filter(usesOwnBackground).map(anchor => `${gatedAnchor(anchor)} {
  background-image: ${surfaceLayers()} !important;
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

/* --- 分组菜单（模型选择列表）：**并入通用菜单配方**，不再有专用规则（它本来就同时匹配通用菜单锚点）--- */
/* --- 粘性分组标题：把**卡片那一摞层**原样重画，只在最下面垫一层不透明地面色（⇒ 挡住滚过去的行、又看不出那条）--- */
${groupTitleRule(`body:not([${PLAIN_ATTR}])`)} {
  background-color: var(--dsw-alias-bg-base) !important;
  background-image: ${groupTitleLayers()} !important;
  background-attachment: ${GROUP_TITLE_ATTACHMENT} !important;
  background-blend-mode: normal, normal, multiply, normal, normal, normal !important;
  /* 圆角**不写在标题条上**（写在条上会漏：缺口里露出滚动的行），改由下面的滚动容器承担；
     这里显式归零是为了盖住优先级更低的旧写法（codebuddy 兜底样式 / 缓存里的旧 CSS）。 */
  border-radius: ${GROUP_TITLE_RADIUS} !important;
}
${groupTitleRule(`body[data-ds-dark-theme]:not([${PLAIN_ATTR}])`)} {
  background-blend-mode: normal, normal, screen, normal, normal, normal !important;
}
/* --- 圆角交给**滚动容器**（顶角裁剪同时作用于条与行 ⇒ 缺口里露出的是菜单自己的玻璃；条自己方角 ⇒ 结构上不可能漏）---
   半径走 GROUPED_MENU_INNER_RADIUS_VARIABLE（默认官方菜单的同心值）；只圆**上两角**（下两角若也圆，滚到底时最后一行会被啃掉）。
   两条规则分别是「锚点的直接子」与「锚点自己」两个形态 —— 相对选择器（以 > 开头）在 :is() 里会被浏览器**静默删掉**，不能合并。 --- */
${`${gatedAnchor(GROUPED_MENU_UNGUARDED_SELECTOR)} ${GROUPED_MENU_SCROLLER_SELECTOR}`} {
  border-radius: ${GROUPED_MENU_SCROLLER_RADIUS} !important;
}
${`${gatedAnchor(GROUPED_MENU_UNGUARDED_SELECTOR)}${GROUPED_MENU_SELF_SCROLLER_SUFFIX}`} {
  border-radius: ${GROUPED_MENU_SCROLLER_RADIUS} !important;
}

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
}
/* 字色：官方写死的浅字必须一起换成**主题感知**的 label token（否则浅卡配浅字仍是白底白字），按稳定后缀匹配。 */
${HOVER_CARD_TEXT_TOKENS.map(({ suffix, token }) => `${HOVER_CARD_ANCHOR} [class*='${suffix}'] {
  color: var(${token}) !important;
}`).join('\n')}
/* --- 模态弹窗**不做玻璃**：它是内容面（列表 / 卡片 / 表格），与上面那批同一套实色抬升面；玻璃只留给控制层的**输入框**。 --- */
`
}
