/**
 * 抬升面（弹出来的框）的**表面绘制**：把背景层那套配方 —— 顶部光层 / 底部本色辉光 / 颗粒 ——
 * 画到菜单与对话框上，让它们和整屏读成同一种材质。
 *
 * ## 两条通道，一个目的：颜色不许分叉
 *
 * owner 指着截图说「插件弹出，下拉弹出，设置弹出，按钮的 hover、区分区域的色块，这些还都是
 * 不统一的，有点乱」。根因是**浮层有两条来源**：
 *
 * 1. **走 token 的**（`--dsw-specific-menu` / `--dsw-alias-bg-layer-2/3`）—— 官方组件与
 *    本仓库的插件大多走这条；
 * 2. **自带硬编码底色的**（本仓库插件里那些 `role=` 弹层）—— token 管不到，只能靠选择器兜。
 *
 * 而第 1 条里还有**根本没有 role 属性**的（`ui-jobs/JobListAction.tsx:157` 是个光秃秃的
 * `<li>` 列表容器 `<ul className={css.menu}>`）—— 语义锚点永远命中不到。owner 截图里那个
 * 「后台任务」下拉就是这么漏掉的。
 *
 * 所以两处**同源但分工**：
 *
 * * token 层（`tones.ts` 的 `POPUP_TOKENS`）**只给颜色** —— `--dsw-specific-menu` /
 *   `--dsw-menu-surface-fill` = 同一个**半透明**菜单填充色（0.1.7 起官方是玻璃色，
 *   见 `POPUP_TOKENS`；`--dsw-specific-tip` 另走内嵌面通道）。覆盖全部消费方，role 有没有都算数；
 * * 本模块的选择器**给图形** —— 按 role 命中真正的浮层，补上颗粒与顶 / 底光，
 *   底色仍读 `PANEL_VARIABLE`（与上面那个 token 同源）。
 *
 * **为什么不把图层塞进 token**：官方把同一个 `--dsw-specific-menu` 也用在
 * `ModelSelect` 的 `.groupTitle` 这类 `position: sticky` 小条上，而百分比渐变按元素
 * 自身盒子缩放 —— 一条 24px 的横条会把 `ellipse 120% 42%` 压成一道硬边金带，
 * 与菜单主体对不上。详见 `POPUP_TOKENS` 的注释与 05-surfaces §8.2。
 *
 * ## 浮层是「面板」，不是地面
 *
 * 中途试过「浮层填充 = 对话区底色」，**owner 已收回该建议**。现在浮层回到面板语义：
 * 一档比地面深、彼此统一的底色（`SURFACE_RUNGS`），分层靠描边、阴影与 hover 洗染。
 *
 * ## 「官方默认 = 完全不介入」
 *
 * owner 硬约束：「官方默认的都不要动，也有个参考，给用户一个完全不动的选择。」
 * 所以本表每条规则都带 `body:not([PLAIN_ATTR])` 前缀 —— token 层在官方默认下也已经发的是
 * 官方原值（`surfaceFill` 对 `tint === ''` 直接返回色阶引用），两条通道一起让路。
 */

import { grainOverGradients } from './backdrop.js'
import {
  BOTTOM_VARIABLE,
  DIALOG_ANCHOR,
  GRAIN_TILE_VARIABLE,
  HOVER_CARD_ANCHOR,
  HOVER_CARD_TEXT_TOKENS,
  PANEL_VARIABLE,
  PLAIN_ATTR,
  TOP_VARIABLE,
} from './constants.js'
import { POPUP_BOTTOM_SHAPE, POPUP_STOP, POPUP_TOP_SHAPE } from './constants.js'

/**
 * 浮层的**语义锚点** —— 兜底通道：token 管不到的（自带硬编码底色的）弹层靠这几条。
 *
 * | 锚点 | 谁长这样 |
 * | :--- | :--- |
 * | `[role='menu']:not(:has([role='group']))` | `Menu` 原语的 `.list` / `.submenu`、dockkit `TabMenu`、`dsh-codebuddy-credits` 的模型菜单。**带分组标题的模型选择器被排除**（理由见该条自己的注释） |
 * | `[data-trigger-menu]` | 输入框上方的 `@` / `/` 菜单卡片（官方自己也拿它当 `:has()` 锚点） |
 * | `:has(> [role='listbox'])` | 命令面板**卡片**（背景长在祖先上、`role` 在内层视口上）—— 详见下方该条自己的注释 |
 * | `[role='listbox']:not([data-trigger-menu] *)` | 自带背景的 listbox 弹层（`dsh-chat-fim` 的候选菜单与敏感度弹层） |
 * | `[role='dialog']:not(:has(> img))` | 各对话框（官方 Modal / 设置面板 / 上下文用量 / 轮次用量 + 三家插件自己的对话框） |
 * | `body > [role='button']` | **悬停卡**（`HoverCard.module.css:13-23`）—— `createPortal` 直挂 `body` 的固定层，`role` 只在 `copyable` 时才给，且**没有** `[role='menu']` 之类语义 |
 * | ⛔ 图片灯箱 | 被 `:not(:has(> img))` 排除：它的 `role='dialog'` 长在**整屏容器**上，染它 = 全屏糊一层金光 |
 *
 * **排除条件为什么是 `> img` 而不是 `> [aria-hidden]`**：最初用的是后者，理由是灯箱的遮罩是它的
 * 直接子元素 —— 但那个条件**误伤了「token 消耗」那两个弹层**（`StatsPills` /
 * `TurnUsagePanel` 的 `.panel` 里都有一个 `<div className={titleRule} aria-hidden>` 当直接子元素，
 * 用来画标题下那条细分隔线）。owner 反馈「对话框下面那三个胶囊没改」指的就是它们。
 * 灯箱真正的唯一特征是那枚**整屏 `<img>`**，用它当判据既保住排除、又不误伤。
 *
 * **悬停卡为什么**不在**本表**（曾经在，后被摘出去）：它的底色是组件自己的字面量
 * `--dsw-hovercard-bg: #2C2C2E`（官方注明 light/dark 同值，**声明在元素自身上**，
 * token 覆盖层发到 `body` 上会被它自己的声明盖过，所以只能靠选择器），
 * 而它的**内容字色也一并写死了**（`Rows.module.css:301` 注释 `dark surface, fixed colors both themes`）。
 * owner 截图指出「左边栏会话 hover 忘了适配」后收进本表 —— 但本表读的是**当前轴**的变量，
 * 于是在**浅色轴把面染成近白**、字仍是给深卡准备的浅字 → **白底白字**（owner 真机截图）。
 * owner 定案后它走**独立规则**（见 {@link HOVER_CARD_ANCHOR}）：面与字**一起**掰回主题，
 * 且**两个档都修**（唯一不带官方默认门的一条）。
 *
 * **注意**：token 那条路**只给颜色**（见 `POPUP_TOKENS`），颗粒与光只能靠本表的选择器。
 * 曾经有三处浮层**只拿到颜色、拿不到质感**（本条注释当时还写它是「唯一」一处）：
 * 没有 role 的官方 `<ul>` 任务列表、子代理血缘弹层（`role='tree'`）、提示条（`role='tooltip'`）——
 * owner 反馈「**后台任务和子代理的弹出是不是没适配样式**」。三者现已全部落进本表。
 * **新增官方浮层时按同一判据核对**：① 先看有没有 role，没有就找它所在的官方槽位；
 * ② 再看**官方这个面是不是两轴同值**（同值 ⇒ 配的是固定字色 ⇒ 必须走恒深规则，别进本表）。
 *
 * 宿主兼容：锚点全是官方公开属性、不碰 hashed 类名；失效只会让浮层退回官方 token 的面
 * （纯观感），不会糊、不会挡点击，所以**不进兼容门**。
 */
export const SURFACE_ANCHORS: readonly string[] = Object.freeze([
  /**
   * **菜单族**（含带分组标题的模型选择器 —— 它们走下面那条**去顶光**的专用规则）。
   *
   * | 锚点 | 谁长这样 |
   *
   * 曾经把带分组标题的菜单整条 `:not(:has([role='group']))` 排除在外，
   * 结果 owner 立刻看出代价：「**模型选择列表那个框好像没有适配咱们样式，是纯色的**」——
   * 排除图层只剩一个不透明色，就是「纯色」。故改回**全量收录**，
   * 用 {@link GROUPED_MENU_SELECTOR} 那条**只去掉顶光**的规则解决横带（见 buildSurfaceCss）。
   */
  "body [role='menu']",
  'body [data-trigger-menu]',
  /**
   * **命令面板的卡片** —— `PopupSelectView` 的背景长在**祖先**上、`role` 在内层视口上，
   * 所以只能问「谁的直接子元素是 listbox」。
   *
   * ⚠️ 这条是**唯一**主体无锚点的 `:has()`（其余几条都收在 `[role='…']` / `[data-…]` 上）。
   * 审计提出「给它加个有界宿主收窄」，**实测后决定不收**，两条理由：
   *
   * 1. **收窄会丢目标**：那个祖先是官方自建的卡片（`PopupSelectView`），
   *    它**不带** `[data-trigger-menu]` 之类的标记 —— 加任何宿主前缀都会把真正要染的那张卡漏掉；
   * 2. **收窄没有收益**：真机实测（5000+ 节点）
   *    `body :has(> [role='listbox'])` 与加宿主后的版本**同价**（1.96ms vs 1.93ms，
   *    且页面里 listbox 数为 0）；更要紧的是这条在 **CSS 规则**里、由浏览器选择器引擎处理，
   *    实测样式重算开销**测量不出来**（Δ 0ms）—— 那个 2ms 是 JS `querySelectorAll` 循环的数字，
   *    本插件并不这么用它。
   *
   * 官方 `role='listbox'` 的生产者只有两处（commands / input-trigger），规模很小。
   */
  "body :has(> [role='listbox'])",
  "body [role='listbox']:not([data-trigger-menu] *)",
  /**
   * **模态弹窗**（设置 / 云端文件 / 归档 …）—— **实色**，不做玻璃。
   * 缘由（含一段撤掉的弯路与 Apple HIG 的依据）见 constants.ts 的 {@link DIALOG_ANCHOR}。
   */
  DIALOG_ANCHOR,
  /**
   * **子代理血缘弹层**（`SubagentHeaderLineage`，头部那枚 `1/3 ⌄`）。
   *
   * 为什么必须收窄成 `body >`：`role='tree'` 官方有**四处**在用 ——
   * `SubagentHeaderLineage`（浮层，`createPortal` 直挂 body）、`JsonTree`、`WorkspaceBrowser`
   * 的会话树、`TrajectoryTable`。后三者都是**内联**组件（长在面板里、不是浮层），
   * 直接写 `[role='tree']` 会把它们的背景换成不透明填充 + 光 + 颗粒 —— 那就错了。
   * 只有子代理那个是 portal 出来的 body 直接子元素。
   */
  "body > [role='tree']",
  /**
   * **子代理会话弹层**（`SubagentCatalogAction`，头部那枚「N subagents」按钮弹出的面板）。
   *
   * owner：「subagent 的弹出和 background jobs 的弹出**风格得一致**」。
   *
   * 两个弹层的**官方材质本来就完全相同**（逐字核过）：
   * * `JobListAction.module.css` 的 `.…_menu { background: var(--dsw-specific-menu);
   *   backdrop-filter: var(--dsw-menu-backdrop-filter); border-radius: 16px;
   *   box-shadow: var(--dsw-elevation-prominent) }`
   * * `SubagentCatalogAction` 的 `.…_menu:before { background: var(--dsw-specific-menu);
   *   backdrop-filter: var(--dsw-menu-backdrop-filter); border-radius: 16px }`
   *
   * 差别**只在我们的锚点表**：jobs 那个 `<ul>` 有一条锚点（见下），
   * 而 subagents 这个弹层一条都命中不到 ⇒ 只有它**没有我们的颗粒与光**。
   *
   * ## 为什么锚点是 `body > :has(> [role='tree'])` 而不是 `body > [role='tree']`
   *
   * 相邻那条（血缘弹层）用 `body > [role='tree']` 是**对的**，但**命中不到本弹层**：
   * 本弹层的结构是 outer(`createPortal` 直挂 body) > …… > `[role='tree']`（内层视口），
   * 即 `role='tree'` 在**内层**、外层才是那个画材质的盒子。
   * 故改为问「**body 的哪个直接子元素含有 role=tree**」。
   *
   * ## 为什么这条不会误伤（真机实测）
   *
   * 在真实会话里逐条数过：`body > :has(> [role='tree'])` = **1 个**，
   * 且那一个正是本弹层（`body` 直接子元素、`position: fixed`、`z-index: 100`）。
   * `JsonTree` / `WorkspaceBrowser` / `TrajectoryTable` 都是**内联**组件（不在 body 直下），
   * 与逐条锚点同一条口径：**收窄在 body 直下**，只命中 portal 出来的浮层。
   */
  "body > :has(> [role='tree'])",
  /**
   * **后台任务列表**（`JobListAction`，头部那枚任务数按钮弹出的 `<ul>`）。
   *
   * 这是全表唯一**没有 role** 的锚点 —— owner 反馈「后台任务和子代理的弹出是不是没适配样式」。
   * 官方那个 `<ul>` 只有 `aria-label`（本地化文案，不能当选择器），token 里也没有对应图层，
   * 所以它以前**只拿到颜色、拿不到质感**。这里改用**它所在的官方槽位**锚定：
   * `JobListAction` 声明自己渲染进 `conversation.session.header.actions`，
   * 而槽位属性 `data-slot` 是官方公开契约（`glass.ts` 也靠 `conversation.session.header`）。
   */
  "body [data-slot='conversation.session.header.actions'] ul",
  /**
   * **轮次导航的预览卡**（`TurnNavigator` 那条右侧刻痕栏，悬停 / 聚焦某轮时弹出）。
   *
   * owner：「官方对话当行 hover 出的框也没有适配样式。」—— 指的就是这张卡。
   *
   * ⚠️ **本条曾经写成 `body > [role='tooltip']`，而那是一条死规则**（一条都命不中）。
   * 当时的注释写「`Tooltip` / `TurnNavigator` 的预览，**均 portal 到 body**」—— **这句话是错的**：
   *
   * | 组件 | 定位 | 是 `body` 直接子元素？ |
   * | :--- | :--- | :--- |
   * | `ui-primitives/Tooltip` | `position: fixed`，源码开头的注释明写 escape … **without a portal** | ❌ |
   * | `TurnNavigator` 的预览（本条要的） | `position: absolute`，长在 `<nav>` 里 | ❌ |
   *
   * 两个都**不** portal，于是 `body >` 把两者一起漏掉 —— 这张卡一直只拿到 token 的颜色。
   * 教训：**收窄选择器之前先核实「它到底长在哪」**，别把推断写进注释当依据。
   *
   * ## 为什么用 `:not([data-side])` 把 `Tooltip` 那颗气泡排除在外
   *
   * 官方 `role='tooltip'` 只有这两个生产者，而它们的定位属性正好可辨：
   * `ui-primitives/Tooltip` 的气泡**总有** `data-side`（`right` / `bottom` / `top`，用于翻转时的
   * `transform`，见 `Tooltip.module.css:22-32`）；`TurnNavigator` 的预览**没有**。
   *
   * 排除它不是遗漏，而是**有意为之**：`Tooltip` 气泡的底色走的 `--dsw-alias-tooltip-bg`
   * **在两轴都是反色**（浅色轴上它是深灰），那是它的语义 —— 见 `tones.ts` 里
   * 「不染的几处（有意）」。给它糊上夜色面板 + 颗粒会把气泡读成一个小菜单，反而丢掉可辨性。
   */
  "body [role='tooltip']:not([data-side])",
])

/**
 * 带**粘性分组标题**的菜单（官方 `ModelSelect` / `dsh-codebuddy-credits` 的模型选择器）。
 *
 * owner 前后两条反馈把它夹成了一个精确解：
 * ①「模型选择器里面两个分类标题的背景，也得处理下。**官方默认样式里是看不到这个背景条的。**」
 * ②（我第一版把整个菜单排除出图层之后）「**模型选择列表那个框好像没有适配咱们样式，是纯色的。**」
 *
 * 所以既不能把图层全给（横带回来），也不能全不给（变成纯色）。定案是**只去掉顶光**：
 *
 * | 图层 | 给不给 | 为什么 |
 * | :--- | :--- | :--- |
 * | 颗粒 | ✅ | 质感的主要来源，且是**均匀贴图**，与盒子高度无关 → 不会造出横带 |
 * | **顶光** | ❌ | 它锚在**盒子顶部**（`ellipse 120% 42% at 50% -12%`），而分组标题正好压在菜单顶部 → 同色的一栏在带光的面上显形，**横带就是它造的** |
 * | 底光 | ✅ | 锚在盒子**底部**，而分组标题永远吸在**顶部**（`position: sticky; top: 0`）→ 两者不相遇，留着它才有纵深 |
 *
 * ⚠️ **颗粒要给分组标题条本身**（{@link GROUPED_MENU_TITLE_SELECTOR}）——2026-09-25 改判，
 * 上一版的"已撤"结论**前提错了**：那次标题上**没有不透明底**，同一张贴图落在它上面
 * 等于**纯加亮**，标题比菜单主体亮 17.6 级，所以撤得对。
 * 现在标题自己刷了**不透明地面色**当底、再把菜单填充画成**图层**（见 `buildSurfaceCss`
 * 里那条规则的注释），所以标题的实际结构 = "地面 + 填充 + 颗粒"，与卡片**同一套层** ⇒
 * 反而**必须**补：不补就是把卡片那片颗粒挖掉一块，露出一条"平带"（owner ①：「有点突兀」）。
 * 判据不是"要不要给标题颗粒"，而是**标题上有没有不透明底**（上一版没有，所以那次该撤）。
 */
export const GROUPED_MENU_SELECTOR = "body [role='menu']:has([role='group'])"

/**
 * {@link GROUPED_MENU_SELECTOR} 的**无守卫写法**，专供「与后代锚点组合」的规则使用。
 *
 * ## 为什么要有这一条（owner：「咱们主题明显比官方的卡」）
 *
 * 真机消融实测（同 DOM、同色调档，只 `styleEl.disabled = true/false`，150 帧 × 每帧插 6 节点）：
 *
 * | 变体 | 规则数 | 样式重算耗时 |
 * | :--- | ---: | ---: |
 * | 原样 | 151 | **3.192s** |
 * | 去掉全部 `:has()` | 139 | **1.216s** |
 * | 只留 `:has()` | 12 | **2.809s** |
 * | 151 条**平凡**规则（`.zzz-N{color:inherit}`） | 151 | 1.256s |
 * | 空表 | 0 | 1.382s |
 *
 * ⇒ **规则条数无关**（平凡规则 ≈ 空表），**开销集中在 12 条 `:has()` 上（约 62%）**。
 * 再逐条定位，最贵的三条里两条是**这里这种「重复守卫」**：
 * `[role='menu']:has([role='group']) [role='group'] > :first-child`（+1.38s，p95 74ms）
 * `[role='menu']:has([role='group']) > :has([role='group'])`（+1.53s，p95 78ms）
 *
 * ## 为什么可以去掉（**严格等价，不是近似**）
 *
 * `:has([role='group'])` 问的是「这个菜单里有没有分组」。而组合规则的后半段
 * **本身就已经要求**「命中元素是某个 `[role='group']` 的后代 / 那个 group 本身」——
 * 既然那个 group 在菜单里面，菜单当然有分组。所以守卫是**冗余的**：
 *
 * * 标题：`menu:has(group) group > :first-child` ≡ `menu group > :first-child`
 * * 滚动容器：`menu:has(group) > :has(group)` ≡ `menu > :has(group)`
 *   （子元素里有 group ⇒ 父菜单里必然也有 group）
 *
 * 真机逐元素验过（菜单开着 + 关着两种状态）：三条规则的命中集合
 * **数量与逐个 `isSameNode` 完全一致**（3/3、3/3、1/1，关闭时同为 0/0）。
 *
 * ## 收益（真机实测，三轮交替取平均）
 *
 * 只改这三条：样式重算 **4.443s → 3.633s（0.82×，省 18%）**。
 * 只删冗余、不改观感 —— 是这批开销里**唯一零风险**的那部分。
 *
 * ⚠️ 单独使用的场合（那条给菜单本体上料的规则）**必须**保留 `:has()`
 * ——那里没有别的锚点能表达「这是个带分组的菜单」，去掉就等于命中的所有菜单。
 */
export const GROUPED_MENU_UNGUARDED_SELECTOR = "body [role='menu']"

/**
 * 分组标题条：`<section role='group'>` 的**第一个子元素**（两个选择器都是这么渲染的，
 * 见 `ModelSelect.tsx:441-442` 与 `CodeBuddyModelSelect.tsx:449-450`）。
 * 用**结构**锚定，不碰 hashed 类名 —— 用 `[class*='_groupTitle']` 还得额外照顾
 * codebuddy 那个非哈希的 `ccb-model-groupTitle`，结构锚点一条就够。
 */
export const GROUPED_MENU_TITLE_SELECTOR = "[role='group'] > :first-child"

/**
 * **输入框上方那三张停靠卡**（排队 / 目标 / 待办）—— 它们**不是浮层**，故单列一张表。
 *
 * ## 为什么以前是「纯色」
 *
 * owner：「**输入框上面那个区域也没适配**，刚才我记得让改了，但是没改。」
 *
 * 三张卡与菜单族共享的是**同一个 token**（`--dsw-specific-tip`），而按本模块的设计
 * （见文件头「两条通道」）**token 那条路只给颜色**、图形必须靠选择器。可它们既没有
 * `role='menu'` 也没有 `[role='dialog']` —— 于是 `SURFACE_ANCHORS` 里**一条都命不中**，
 * 只拿到 token 染过的一个不透明色 = 「纯色」。**这正是我上次只说了「需要一条图层规则」却没写的那条。**
 *
 * ## 每张卡该画在**哪一层**
 *
 * 三张卡都是「外层 wrapper + 内层自己带底色的面」，底色**不在** wrapper 上：
 *
 * | 组件 | wrapper（无底色） | 真正带底色的面（要画的） |
 * | :--- | :--- | :--- |
 * | `QueueDock` | `[data-queue-dock]`（`.dock`） | 它的第一个子元素 `.panel`（`border-radius: 12px 12px 0 0`，与输入框卡上缘相接） |
 * | `GoalBar` | `[data-goal-bar]`（`.dock`） | 它的第一个子元素 `.bar`（`height: 36px`、圆角 12px） |
 * | `TodoPanel` | —— | **根元素自己**（`<section>`，圆角 12px） |
 *
 * ⚠️ **不能直接画在 wrapper 上**：wrapper 是整个停靠列的方框，而面板是**带圆角**的
 * ——画在 wrapper 上会在圆角外露出四个直角。
 *
 * `[data-queue-dock]` / `[data-goal-bar]` 是官方公开的 data 属性（已在发行 bundle
 * `dsh-client-ui-conversation/lib/client.js`、`dsh-client-ui-goal/lib/client.js` 里核到）；
 * `data-testid='todo-panel'` 是那个 `<section>` 上**唯一非本地化**的稳定钩子
 * （它的 `aria-label` 是 `t('todo.title')`，不能当选择器）。
 *
 * ## 它们为什么也吃不到背景层的光
 *
 * 三张卡都在 `[data-composer-seat]` 里，而底座坐落在 `[data-conversation-scroll]`（z 81）
 * **之上**，背景层（z 80）照不进来 —— 与顶栏 / 右边栏 / 底座那条带子**同一条不变式**：
 * 凡抬到背景层之上、且自己有不透明底色的面，**都得自己画一遍颗粒与光**。
 */
export const COMPOSER_CARD_ANCHORS: readonly string[] = Object.freeze([
  'body [data-queue-dock] > :first-child',
  'body [data-goal-bar] > :first-child',
  "body [data-testid='todo-panel']",
])


/**
 * **输入框卡片里那两个圆形图标按钮**（`+` 命令面板 / 附件）—— 默认去掉底色，只保留 hover 底。
 *
 * ## owner 的诉求
 *
 * 配图圈出这两个按钮：「这两个按钮得适配下，我觉得**像下拉菜单一样，默认底就不要了，
 * 保留 hover 底就行**。」
 *
 * ## 为什么它们看着「凸出来」
 *
 * 官方给它们的底色是 `background: var(--dsw-specific-selector)`
 * —— 一个**不透明实色**（真机 `#353638`）。而这两个按钮**坐在玻璃卡片里面**：
 * 卡片的底色是半透明 + 模糊，按钮却是一块实色板 → 读成两个**贴在玻璃上的塑料片**，
 * 与卡片不是同一种材质。去掉默认底之后，按钮区域显示的就是**卡片自己的玻璃**，材质统一了。
 *
 * ## 做法：覆盖 token，而不是改规则
 *
 * 官方那两条规则是：
 *
 * | 状态 | 官方选择器 | 底色来源 |
 * | :--- | :--- | :--- |
 * | 默认 | 类名 `uV2eYG_add` | `var(--dsw-specific-selector)`（实色） |
 * | **hover** | 同类名 `:hover:not(:disabled)` | `var(--dsw-alias-interactive-bg-hover-solid)`（**另一个 token**） |
 *
 * 两个状态用的是**两个不同的 token** —— 所以只把前者置为 `transparent`，
 * **hover 那条规则天然不受影响**，一行规则即可，不必重写 hover、也不必跟特异度较劲。
 *
 * ## ⚠️ 为什么敢覆盖这个 token（已核消费方）
 *
 * `--dsw-specific-selector` 名字很通用，覆盖前逐包 grep 了官方产物：
 * **全树只有 `.uV2eYG_add` 一个消费方**（`dsh-client-ui-conversation`），
 * 定义在 `dsh-client-ui-theme`（两轴各一份 `--dsw-static-neutral-bluish-60` / `-800`）。
 * 没有别的组件读它。
 *
 * 但**仍然把覆盖范围收在卡片里**（不写 `body`）：这个 token 语义上是「选择器底色」，
 * 官方将来若给别的组件也接上，写 `body` 会**误伤**；收在卡片内则永远不会外溢。
 * 与 owner 那条「不要误伤」（底座夹层那次）同一条纪律。
 */
export const COMPOSER_ICON_BUTTON_SCOPE = 'body [data-composer-card]'

/**
 * 浮层表面要叠的 `background-image` 图层，**从上到下**：
 *
 * 1. 颗粒（只有色调开了 `grain` 才是图，否则是 `none`）—— 压在最上面才像砂面；
 * 2. 顶部光层（深色轴暖金 / 浅色轴主色，三层光同源，见 `tones.ts`）；
 * 3. 底部本色辉光（该色调自己的纵深）。
 *
 * 三层全部走变量，缺变量时落到 `transparent` / `none` —— 即「官方默认」下等于什么都不画
 * （官方默认下这些规则本来也被 `PLAIN_ATTR` 挡住）。
 * **每一层的 alpha 都用色调表里的原始值**（不放大）：浮层是**实况**，不是色卡预览。
 * @returns 可直接写进 `background-image` 的图层串。
 */
export function surfaceLayers(): string {
  return [
    `var(${GRAIN_TILE_VARIABLE}, none)`,
    `radial-gradient(${POPUP_TOP_SHAPE}, var(${TOP_VARIABLE}, transparent), ${POPUP_STOP})`,
    `radial-gradient(${POPUP_BOTTOM_SHAPE}, var(${BOTTOM_VARIABLE}, transparent), ${POPUP_STOP})`,
  ].join(',\n    ')
}

/**
 * {@link GROUPED_MENU_SELECTOR} 专用的图层串：**颗粒 + 底光，没有顶光**（理由见该常量的表）。
 * @returns 可直接写进 `background-image` 的图层串。
 */
export function menuSurfaceLayers(): string {
  return [
    `var(${GRAIN_TILE_VARIABLE}, none)`,
    `radial-gradient(${POPUP_BOTTOM_SHAPE}, var(${BOTTOM_VARIABLE}, transparent), ${POPUP_STOP})`,
  ].join(',\n    ')
}

/**
 * 菜单填充色变量 —— 标题条与卡片**必须读同一个**，否则标题就是一条色差带。
 *
 * 官方 0.1.7 把菜单表面的填充收进 `--dsw-menu-surface-fill`（`MenuSurface.module.css:26`
 * 的 `.material` 用它），而 `--dsw-specific-menu` 是它的**别名**
 * （实测官方样式表：`body { --dsw-specific-menu: var(--dsw-menu-surface-fill) }`）。
 * 两个 token 名字不同、值同源，所以这里**两个一起染**（见 `POPUP_TOKENS`），
 * 规则里优先读语义更准的那个、并留别名兜底。
 */
const MENU_FILL = `var(--dsw-menu-surface-fill, var(--dsw-specific-menu))`

/**
 * 粘性分组标题条的 `background-image`，**从上到下**：
 *
 * 1. **卡片自己的颗粒** —— 卡片把它画在菜单元素的 `background-image` 最上层
 *    （{@link menuSurfaceLayers}），所以标题也得画在最上层、**满强度**；
 * 2. **卡片填充** —— 与卡片同一个 token、同一个 alpha；
 * 3. **地面原样重画**（{@link grainOverGradients}：颗粒 + 三段光，`fixed` 对齐视口）
 *    —— 卡片是玻璃，它看到的就是「地面」这四层；标题另有不透明底，必须把地面重画一遍，
 *    否则「地面长什么样」这件事在标题上就丢了。
 *
 * 合成结果 = 颗粒 叠在（填充 叠在 地面 上）—— 与卡片**逐层同源**，实测两轴都在 1 级以内。
 * @returns 可直接写进 `background-image` 的图层串。
 */
export function groupTitleLayers(): string {
  return [
    `var(${GRAIN_TILE_VARIABLE}, none)`,
    `linear-gradient(${MENU_FILL}, ${MENU_FILL})`,
    grainOverGradients(),
  ].join(',\n    ')
}

/**
 * {@link groupTitleLayers} 的**逐层 `background-attachment`**：最上面两层（标题自己的颗粒、
 * 卡片填充）按元素盒子，地面那四层 `fixed` —— 地面是 `position: fixed` 的整屏层，
 * 百分比按视口解析；少了 `fixed`，一条 26px 的横条会把 `ellipse 80vw 45vh` 压成硬边带
 * （05-surfaces §8.2 记的那个坑）。
 *
 * ⚠️ **值必须逐层给足**：CSS 在值少于层数时是**整串重复**，只写三个的话第 4、5 层会回到
 * `scroll`，光层当场被压扁。
 */
export const GROUP_TITLE_ATTACHMENT = 'scroll, scroll, fixed, fixed, fixed, fixed'

/**
 * 分组菜单的**滚动容器**（分组标题的吸顶上下文）—— 菜单的**直接子元素**里那个
 * "装着全部 `[role='group']`"的盒子。
 *
 * 用**结构**锚定：官方 `ModelSelect.tsx:437` 是 `div.groups`，本仓库 codebuddy 的
 * `CodeBuddyModelSelect.tsx:445` 是 `div.ccb-model-groups`；两者都是菜单的直接子元素、
 * 都装着 `section[role='group']`。不碰 hashed 类名。
 *
 * ⚠️ **本常量是"后代片段"，以组合符开头**（与 {@link GROUPED_MENU_TITLE_SELECTOR} 同类），
 * 使用时拼在菜单锚点之后（`${菜单选择器} ${本常量}`）。
 * **不能**写成 `:scope > …`：`:scope` 是给 `querySelector` 用的，
 * 在**样式表**里没有上下文引用元素，按规范退化成 `:root` ⇒ 规则静默失效
 * （正是本文件反复记录的那类"规则一条都命不中"的坑）。
 */
export const GROUPED_MENU_SCROLLER_SELECTOR = "> :has([role='group'])"

/**
 * 「分组菜单**内圈**圆角」的自定义属性名 —— {@link GROUPED_MENU_SCROLLER_RADIUS} 经它取值。
 *
 * ## 为什么需要一个变量，而不直接把半径写进规则
 *
 * 同心圆角 = **菜单自己的外圆角 − 菜单自己的内边距**，而各菜单的外圆角不同
 * （官方 `MenuSurface` 16 ⇒ 12；本仓库 codebuddy 菜单 20 ⇒ 16）。可滚动容器那条规则的
 * 选择器**同时命中两个菜单**（真机实测：页面上含 `[role='group']` 的 `role='menu'`
 * 就是这两个），把半径写死在规则里必然让其中一个的同心关系错掉 ——
 * 这条已经实测踩过一次（写 12px 之后 codebuddy 菜单读到 `12px 17px 0 0`，
 * 而它的正确值是 `16px 21px 0 0`）。
 *
 * 做法：规则只读变量、**默认值是官方菜单的同心值**；菜单所有者在自己菜单元素上覆盖它
 * （自定义属性沿继承树向下传，滚动容器是菜单的后代 ⇒ 各自读到各自的值）。
 * 于是"配方"（同心半径 + 滚动条补偿 + 只圆上两角）**只有一份**，
 * 各菜单只负责报出自己那个数。
 *
 * ⚠️ **命名带插件前缀**（`--dsh-theme-tone-*`，与本插件其它热变量一致），
 * 不用泛化的 `--dsh-menu-inner-radius`：前者明确"谁写的、谁能覆盖"，也不会与官方未来
 * 可能引入的同名变量撞车。
 */
export const GROUPED_MENU_INNER_RADIUS_VARIABLE = '--dsh-theme-tone-menu-inner-radius'

/**
 * 分组标题条的圆角：**0**（方角）。
 *
 * owner 第五轮要的是"把这个条变成圆角的"；第六轮反馈「改成圆角后确实边缘会漏」。
 * 实测确认这是几何必然（缺口里露出滚动的行），因此圆角**改由滚动容器承担**
 * （见 {@link GROUPED_MENU_SCROLLER_RADIUS}），条本身必须回到方角 ——
 * 它一旦有圆角，缺口就回来了。
 *
 * ⚠️ 保留这个常量（而不是在规则里裸写 `0`）是为了让"圆角归零"这件事在一处可读、可断言。
 */
export const GROUP_TITLE_RADIUS = '0'

/**
 * **圆角写在滚动容器上，不写在标题条上** —— owner 第六轮的新办法。
 *
 * ## 为什么不能写在标题条上（第五轮那版为什么漏）
 *
 * 标题条自己带圆角 ⇒ 「条矩形 − 圆角」那块缺口是**真的没画**，而缺口里正好是滚动的行
 * （`.ccb-model-option` 的悬停底铺满整行宽，行文字从 x=8 起）。于是行从缺口里透出来 ——
 * 这就是 owner 第六轮报的「边缘会漏」。**这是几何必然，跟半径大小、配色都无关。**
 *
 * 真机实测（owner 实例，吸顶条，把条后面的行刷成洋红、数条矩形内的洋红像素）：
 *
 * | 条的圆角 | 4px | 6px | 8px | 16px（被 clamp 成 13） | 0（方角） |
 * | :--- | ---: | ---: | ---: | ---: | ---: |
 * | 漏出的行像素 | 6 | 16 | 30 | **70** | **0** |
 *
 * 附：条高 26px，所以声明 16px 会被**等比压到 13px**（半高）—— 那一版其实是个胶囊。
 *
 * ## 新办法：圆角交给滚动容器
 *
 * 容器顶角的裁剪**同时作用于条与行** ⇒ 那里既没有条、也没有行，露出的是**菜单自己的玻璃**
 * （与卡片同源，不用猜任何颜色）；条自己保持方角 ⇒ 它没有缺口 ⇒ **结构上不可能漏**。
 *
 * 真机实测（6 个滚动位置 0/40/90/140/200/300，同上判据）：
 *
 * | 写法 | 漏 |
 * | :--- | ---: |
 * | 条方角 + 容器不圆 | 0 / 0 / 0 / 0 / 0 / 0 |
 * | 条方角 + 容器上两角（本常量） | **0 / 0 / 0 / 0 / 0 / 0** |
 * | 条自己四角 16px（第五轮那版） | 0 / 44 / 70 / 70 / 39 / 0 |
 *
 * ## 半径取「同心值」= 菜单圆角 − 菜单内边距
 *
 * 菜单是「圆角盒 + 4px 内边距」，容器贴在内边距里侧；要让容器的弧线与菜单的弧线**重合**，
 * 就必须同圆心，即内圆角 = 外圆角 − 内边距。而**每个菜单的外圆角不同**：
 *
 * | 菜单 | 外圆角 | 内边距 | 同心内圆角 |
 * | :--- | ---: | ---: | ---: |
 * | 官方 `MenuSurface` `.surface` | `--dsw-radius-lg`(16) | 4px | **12px = `--dsw-radius-md`** |
 * | 本仓库 codebuddy `.ccb-model-menu` | 20px | 4px | **16px = `--dsw-radius-lg`** |
 *
 * 所以半径**不能写死在这条规则里** —— 本规则的选择器同时命中两个菜单（真机实测确实如此），
 * 写死一个值会让另一个菜单的同心关系错掉（踩过一次：写 12px 之后 codebuddy 菜单实测
 * `12px 17px 0 0`，而它的同心值应是 `16px 21px 0 0`）。
 *
 * 做法：半径经 {@link GROUPED_MENU_INNER_RADIUS_VARIABLE} 间接取值，**默认给官方菜单的
 * 同心值**；菜单所有者可以在自己的菜单元素上覆盖它（codebuddy 就在 `.ccb-model-menu` 上
 * 声明 16px）。自定义属性沿继承树向下传，容器是菜单的后代 ⇒ 自然读到各自菜单的值。
 * 这样"配方（半径 + 滚动条补偿 + 只圆上两角）"只有一份，**各菜单只报自己那个数**。
 *
 * ## 为什么右上角多补一个滚动条宽
 *
 * 所有行的右边缘都在容器的**内容盒**上，比容器 border-box 右边缘**靠左一个滚动条宽**
 * （官方 `--dsh-scrollbar-width`，实测 5px）；左边缘则与容器左边缘齐平。同一个半径下，
 * 右角的弧线切进条里的深度会比左角**浅 5px**。真机实测（吸顶条逐行「最左 / 最右被裁像素」）：
 *
 * | 写法 | 左角内缩 | 右角内缩 |
 * | :--- | :--- | :--- |
 * | `R R 0 0` | 10,7,5,4,3,2,2,1,1,1 | 5,2,0,0,…（右侧偏浅） |
 * | `R calc(R+sb) 0 0` | 10,7,5,4,3,2,2,1,1,1 | 9,5,3,1,…（基本对称） |
 *
 * ⚠️ **已知取舍（诚实记录）**：补了之后，**内容不溢出**（没有滚动条）时右角会比同心值**深 5px**。
 * 这一条没有可靠的 CSS 判据（滚动条有无在 CSS 里不可知），而两个方向的偏差都发生在
 * 「条与卡片」的边界上 —— 实测这两者只差 **0.7 级**（41.7,42.6,46.0 vs 41.0,42.0,46.0），
 * 误差肉眼不可辨；取"有滚动条"那一侧，因为分组菜单满屏时才是常态。
 *
 * ## 顺带解决了"圆角其实看不见"这件事
 *
 * 真机实测：条内部 (41.7, 42.6, 46.0) vs 条正下方 (41.0, 42.0, 46.0) —— 差 0.7 级。
 * 也就是说第五轮那条圆角**本来就是靠"缺口里露出的行"（比条亮 18~45 级）才被看见的**；
 * 换句话说，「圆角看得见」与「边缘不漏」在该写法下互斥。改由容器承担之后，圆弧的边界是
 * 「条 / 菜单玻璃」，两者同源 ⇒ 视觉上就是**卡片自己的圆角**，而不是一条带子的角。
 *
 * ⚠️ **切圆仍然不改变填充**：条的不透明底照旧（见 `groupTitleLayers`）——
 * owner 第三轮定的硬约束（「不是变成透明的」）。
 */
export const GROUPED_MENU_SCROLLER_RADIUS =
  `var(${GROUPED_MENU_INNER_RADIUS_VARIABLE}, var(--dsw-radius-md, 12px)) ` +
  `calc(var(${GROUPED_MENU_INNER_RADIUS_VARIABLE}, var(--dsw-radius-md, 12px)) + var(--dsh-scrollbar-width, 5px)) 0 0`

/**
 * 给锚点挂上「官方默认」门。
 *
 * **不能**写成 `body:not([…]) ${anchor}` —— 锚点自带 `body ` 前缀，那样会拼出
 * `body:not([…]) body [role='menu']`（**body 套 body**），永远不可能命中：
 * 规则静默失效，只有走 token 的组件还留着质感，其余弹层全成了纯色。
 * 正确做法是把门**并进**锚点自己的 `body` 上。
 * @param anchor - {@link SURFACE_ANCHORS} 里的一条。
 * @returns 带门的选择器。
 */
function gatedAnchor(anchor: string): string {
  return anchor.replace(/^body\b/u, `body:not([${PLAIN_ATTR}])`)
}

/**
 * 分组标题条规则的**选择器构造**：把 {@link GROUPED_MENU_SELECTOR} 自带的 "body " 前缀
 * 换成调用方给的前缀（要带门 / 还要带轴门）。
 *
 * **不能**直接拼 `${prefix} ${GROUPED_MENU_SELECTOR}` —— 锚点自带 `body `，
 * 会拼出 `body:not([…]) body [role='menu']…`（**body 套 body**），规则静默失效
 * —— 与 {@link gatedAnchor} 的 ⚠️ 是同一个坑（那里选择把门并进锚点，这里选择换前缀）。
 * @param bodyPrefix - 新的 body 前缀（已含所需的门）。
 * @returns 完整选择器。
 */
function groupTitleRule(bodyPrefix: string): string {
  // ⚠️ 用**无守卫**锚点：组合规则的后半段已经要求 `[role='group']` 的存在，
  // `:has()` 是冗余的，而它每次 DOM 变动都要重匹配（真机实测最贵的三条之一）。
  // 等价性与收益见 {@link GROUPED_MENU_UNGUARDED_SELECTOR}。
  return `${bodyPrefix} ${GROUPED_MENU_UNGUARDED_SELECTOR.replace(/^body\s+/u, '')} ${GROUPED_MENU_TITLE_SELECTOR}`
}

/**
 * 抬升面样式表文本（**只加质感，不刷底色**）。
 *
 * ## ⚠️ 2026-09-24 架构收口：底色与模糊全部交回官方
 *
 * owner 定的口径：「**统一设计语言**，该透明模糊的就透明模糊，不破坏我们原来的设计，
 * 适配新的官方设计语言」，且明确「透明和模糊**和官方默认一样**就行」。
 *
 * 官方 0.1.7 的菜单族材质契约（`docs/web-styling.zh.md:25`）：凡用半透明
 * `--dsw-specific-menu` 填面的规则，**必须**在同一条规则里配上
 * `backdrop-filter: var(--dsw-menu-backdrop-filter)` —— 这两个变量已由 `tones.ts` 的
 * `POPUP_TOKENS` 按色调染过（只换 RGB、保住官方 alpha），所以**官方自己就是带色调的**，
 * 本插件不需要再声明这一对。
 *
 * 这条表演进过三步，全部记录在此（免得再走）：
 *
 * 1. **刷不透明底**（0.1.5 时代）→ 0.1.7 官方把弹层统一成「半透明 + 模糊」之后，
 *    这层不透明底把官方玻璃**整块盖掉**（owner：「后台任务 / CodeBuddy 弹窗不是透明模糊」）；
 * 2. **改成刷官方的半透明 + 模糊**→ 官方**已经画过**，于是变成画两遍：
 *    官方画在元素自己身上的（菜单原语、`JobListAction` 的 `<ul>`）是同值覆盖、无碍；
 *    但官方画在 `::before` 上的（`SubagentCatalogAction`）**叠两次同色 ⇒ 等效 0.75**
 *    （owner：「子代理卡片好像没有透明模糊吧？」）；
 * 3. **本版：一个材质声明都不写** —— 由官方自己的材质原样生效（= 官方默认的透明与模糊），
 *    本表只负责 `background-image` 的**质感层**（颗粒 + 光），色调走 `ctx.theme.overrideTokens`
 *    染进官方 token（官方接入方式）。
 *
 * 仍然保留 `!important`：官方写的是 `background:` **简写**（内含 `background-image: none`），
 * 特异度又各写各的，压不过就是静默失效。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildSurfaceCss(): string {
  return `/* ===== dsh-theme-tone 抬升面（菜单 / 对话框）：只叠质感，底色交回官方 =====
   选择器带 ${PLAIN_ATTR} 门：官方默认下整表不命中（owner：官方默认的都不要动）。 */
${SURFACE_ANCHORS.map(anchor => `${gatedAnchor(anchor)} {
  background-image: ${surfaceLayers()} !important;
}`).join('\n')}
/* --- 质感**同时**叠到 ::before 上（官方把材质画在 ::before 的那些弹层）---
   owner 2026-09-24：「子代理**透明了**，但是**纹理和打光又没了**」。

   根因是**绘制顺序**：官方 "SubagentCatalogAction" 把材质画在自己的 "::before" 上
   （"content: ''; position: absolute; inset: 0; z-index: -1; background: var(--dsw-specific-menu);
   backdrop-filter: var(--dsw-menu-backdrop-filter)"）。
   负 z-index 的伪元素画在**父元素的背景与边框之上、内容之下** ——
   而我们上面那条把颗粒与光画在**父元素自己的 background-image** 上，
   于是**官方那层半透明材质把我们整个质感盖住了**（观感：「透明了，但纹理没了」）。

   修法与输入卡同一套（那一处踩过完全相同的坑，见 glass.ts 的卡片 ::before）：
   把同一串图层**再画一份到 ::before** —— 同一元素上，伪元素背景与它自己的
   background-color / backdrop-filter 同层合成，质感就压在材质之上了。

   ⚠️ **两层都要留**：材质画在元素自己身上的那些弹层（菜单原语、后台任务 "<ul>"）只有
   上面那条生效；画在 "::before" 上的（本弹层）只有这条生效。两条互不冲突
   （后者在伪元素上，各画各的）。
   ⚠️ 用 "background-image" 而不是叠加整串 "background" 简写 —— 简写会把官方那张材质的
   "background-color" 一起重置掉。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
${SURFACE_ANCHORS.map(anchor => `${gatedAnchor(anchor)}::before {
  background-image: ${surfaceLayers()} !important;
}`).join('\n')}
/* --- 菜单族：**不再由我们声明填充与模糊**（官方 0.1.7 已经成对画好了）---
   owner：「透明和模糊和**官方默认一样**就行」。

   ⚠️ 这里原先会给每个菜单族锚点刷一对
   "background-color: var(--dsw-specific-menu); backdrop-filter: var(--dsw-menu-backdrop-filter)"，
   本意是「兜住官方没配成对的地方」。但 0.1.7 官方**到处都配好了**，于是这条规则变成
   **在官方已经画过材质的地方再画一遍** —— 后果按官方的画法分两种：

   | 官方的材质画在哪 | 我们再画一遍的结果 |
   | :--- | :--- |
   | **元素自己身上**（菜单原语、"JobListAction" 的 "<ul>"、本仓库各组件） | 同值覆盖，看不出问题 |
   | **元素的 "::before" 上**（"SubagentCatalogAction" 的 ".…_menu:before"） | **同一个 50% 色叠两次 ⇒ 等效 75%** —— 卡片看着"不透明"（owner：「子代理卡片好像没有透明模糊吧？」） |

   所以这一整块**撤掉**：官方的材质原样生效（= 官方默认的透明与模糊），我们只负责
   "background-image" 的质感层与 token 层的色调。

   唯一真正需要补的是官方自己漏配的那一处（粘性分组标题），它单独在下面处理。
   （本段在模板字符串里，注释中**不能出现反引号**。） */

/* --- 带**粘性分组标题**的菜单：**只去掉顶光**（见 GROUPED_MENU_SELECTOR 的表）---
   两条 owner 反馈夹出来的解：全给图层 → 分组标题显形成横带；全不给 → 「是纯色的」。
   顶光锚在盒子顶部、正好被标题压住，是横带的**唯一来源** → 去掉它；
   颗粒（均匀贴图）与底光（锚盒子底部、与吸顶的标题不相遇）都留着，质感还在。
   ⚠️ **标题条自己也要补颗粒**（{@link groupTitleLayers}）—— 标题有不透明底，
   那片颗粒不会「落在同一张贴图上等于纯加亮」，而是卡片质感的一部分；
   不补就等于把卡片那片颗粒挖掉一块、露出一条平带。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
${gatedAnchor(GROUPED_MENU_SELECTOR)} {
  background-image: ${menuSurfaceLayers()} !important;
}
/* --- 粘性分组标题：把**卡片那一摞层**原样重画，只在最下面垫一层不透明的 ---
   owner 对这条报了四轮，其中三次是我修坏的。四句原话合起来就是全部约束：
     ① 「把分类标题的背景色去掉，有点突兀，咱们的和官方的一起处理。」
     ② 「透明和模糊和官方默认一样就行。」
     ③ 「给修坏了又。又重叠了。**只是把那个背景去掉，不是变成透明的**。」
     ④ 「背景条又出来了…那条背景条要和菜单底色一致，这样就看不出来有那一条。」
   ②+③+④ = 底色**必须挡住滚过去的行**（不透明），**又必须和卡片同色**（看不出那条）。

   难在哪：卡片是**半透明玻璃**，它的表面不是一个静态色，而是一摞合成：
     卡片 = [颗粒] 叠在（菜单填充 叠在 [地面] 上）        ← 地面 = 底色 + 三段光 + 颗粒
   标题要挡住行，就必须自带不透明底；于是唯一能让它"看不出"的写法是
   **把上面那一摞逐层重画一遍**，只把最下面的「页面内容」换成静态的「地面」。

   ## 第四轮的真实根因：**层序反了**（不是配色问题）

   第三版写的是 "background-image: 填充渐变, 颗粒" —— 列表在前的画在**上面**，
   于是合成成了 [填充] 叠在（颗粒 叠在 bg-base 上），与卡片的 [颗粒] 叠在（填充 叠在 地面上）
   正好把两层调了个个儿。后果实测（真机 dsh 0.1.7，截图取样）：

   | 轴 / 色调 | 标题条 | 卡片 | 差 |
   | :--- | :--- | :--- | :--- |
   | 浅色轴 霜蓝 | (248.5, 249.1, 249.7) | (243.1, 244.7, 244.6) | **+5 级（标题偏亮）** |
   | 深色轴 绯红 | (43.4, 35.4, 39.9) | (54.5, 45.0, 49.2) | **−10 级（标题偏暗）** |

   两个方向都错，而且颗粒还被填充的 alpha 压掉了 42%（卡片是满强度）——
   "一条更亮/更暗、且更平的带子"，正是 owner ④ 说的"背景条又出来了"。

   ## 本版：三组层、逐层同源（{@link groupTitleLayers}）

     background-color = bg-base        ← 不透明的地面**底色**（⇒ 挡住行；它只是底色，不是"白板"）
     background-image = 颗粒, 填充渐变, 地面（颗粒 + 三段光）
     ⇒ 合成 = [颗粒] 叠在（填充 叠在 地面上），与卡片**逐层同源**

   实测同一套取样：浅色轴霜蓝差 (−0.1, −0.9, −0.4)；深色轴绯红亮度差 0.2
   （逐通道最大 1.6，肉眼不可辨）。

   ⚠️ **颗粒必须画在最上面、且是满强度**（不是"多画一层"）：卡片就是这么画的
   （见 surfaceLayers 的图层表：颗粒压在最上面才像砂面）。
   第三版把颗粒压在填充下面 → 只剩 42% 强度，标题成了"平带"。

   ⚠️ **地面那四层必须 fixed**（{@link GROUP_TITLE_ATTACHMENT}）：地面是整屏的
   "position: fixed" 层，百分比按**视口**解析；一条 26px 的横条若按自身盒子解析，
   "ellipse 80vw 45vh" 会被压成一道硬边光带（05-surfaces §8.2 记的就是这个坑）。
   最上面两层（标题自己的颗粒、卡片填充）仍按元素盒子 —— 与卡片一致。

   ⚠️ **地面颗粒的混合模式要跟着轴走**：地面深色轴用 screen、浅色轴用 multiply
   （见 buildBackdropCss）。所以下面第二条规则只改 background-blend-mode ——
   元素**自己内部**的图层之间用 background-blend-mode，跨元素的 mix-blend-mode 在这里不适用。

   ⚠️ **不写 backdrop-filter**：标题在**菜单内部**，菜单自己已经是 backdrop root，
   标题再声明模糊只会采样子树里**正在滚动的行**（实测 31.719/px，比不写更脏 19.885/px）。
   官方那处没配模糊是有意的 —— 这一条我们跟官方一致（owner ②）。

   ⚠️ **这一条同时管住两个标题**：官方 "ModelSelect" 的 ".groupTitle"（真机类名
   "._7KE1Ra_groupTitle"）与 codebuddy 插件的 ".ccb-model-groupTitle"
   （owner ①：「咱们的和官方的一起处理」）。codebuddy 那段 CSS 是**没有本插件时**的兜底：
   那时卡片没有颗粒、地面也没有光，所以"bg-base + 填充"就够（真机实测差 1 级）；
   装上本插件后由这条接管，把颗粒与地面一并补上。

   ⚠️ 已知近似（诚实记录）：卡片是玻璃，它的背景是**被 blur 过的动态内容**；
   菜单压在正文上时那部分无法静态算出，只能取"地面"这个唯一可静态确定的参照，
   残留随内容而定（通常 1–5 级）。要完全消掉只能给标题上 backdrop-filter，
   而那会把滚动的行糊进来（见上）—— 两害相权，取静态同源。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
${groupTitleRule(`body:not([${PLAIN_ATTR}])`)} {
  background-color: var(--dsw-alias-bg-base) !important;
  background-image: ${groupTitleLayers()} !important;
  background-attachment: ${GROUP_TITLE_ATTACHMENT} !important;
  background-blend-mode: normal, normal, multiply, normal, normal, normal !important;
  /* ⚠️ owner 第六轮改判：圆角**不写在标题条上**，改由下面的滚动容器承担。
     写在条上会漏（缺口里露出滚动的行）—— 完整实测与几何见
     GROUPED_MENU_SCROLLER_RADIUS 的文档块。这里显式归零，是为了盖住
     优先级更低的旧写法（codebuddy 兜底样式 / 缓存里的旧 CSS）。 */
  border-radius: ${GROUP_TITLE_RADIUS} !important;
}
${groupTitleRule(`body[data-ds-dark-theme]:not([${PLAIN_ATTR}])`)} {
  background-blend-mode: normal, normal, screen, normal, normal, normal !important;
}
/* --- 圆角交给**滚动容器**（owner 第六轮新办法）---
   见 GROUPED_MENU_SCROLLER_RADIUS 的文档块：容器顶角的裁剪同时作用于标题条与行
   ⇒ 缺口里既没有条、也没有行，露出的是菜单自己的玻璃；条自己方角 ⇒ 结构上不可能漏。
   半径**走变量**（GROUPED_MENU_INNER_RADIUS_VARIABLE），默认给官方菜单的同心值
   （16 − 内边距 4 = 12 = --dsw-radius-md）；菜单外圆角不同的那些在自己的菜单元素上覆盖它
   （真机实测页面上含 role=group 的 role=menu 就是官方与 codebuddy 两个，后者是 20 ⇒ 16px）。
   ⚠️ 只圆**上两角**：下两角若也圆，滚到底时最后一行会被啃掉。
   ⚠️ 锚点用**无守卫**版：:has() 在这里冗余（后半段已经要求 group 存在），
   去掉它省一次重匹配 —— 等价性与实测见 GROUPED_MENU_UNGUARDED_SELECTOR。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
${`${gatedAnchor(GROUPED_MENU_UNGUARDED_SELECTOR)} ${GROUPED_MENU_SCROLLER_SELECTOR}`} {
  border-radius: ${GROUPED_MENU_SCROLLER_RADIUS} !important;
}

/* --- 输入框上方那三张**停靠卡**（排队 / 目标 / 待办）---
   owner：「**输入框上面那个区域也没适配**，刚才我记得让改了，但是没改。」
   锚点与「为什么画在子元素上」见 COMPOSER_CARD_ANCHORS。

   ⚠️ **底色必须用卡片自己的 token（--dsw-specific-tip），不能用面板变量 PANEL_VARIABLE**。
   这两者语义不同：面板变量是**抬升面**（浮在地面之上的浮层）的面板色，
   而这三张卡是**内嵌面**（嵌在地面之内的内容块），官方给它们的底色是 --dsw-specific-tip
   （浅色轴 bluish-60、深色轴 bluish-800），走的是独立染色通道（见 05-surfaces §4.0.2）。

   曾经这里写 background-color: var(面板变量)：那时浅色轴面板比例 .07、两者观感接近，
   看不出问题。等抬升面收到 0（面板变量在浅色轴变成纯白）之后，
   这条 !important 就把三张卡的面**盖成了纯白**，--dsw-specific-tip 的染色完全失效 ——
   owner 随即反馈「goal、todo、排队对话好像都没改」。**只写图层、不写底色**即根治：
   底色交给 token 层（§4.0.2 那条通道），这里只负责它拿不到的那部分（颗粒 + 光）。

   ⚠️ **2026-09-24 起图层也画一份到 ::before**（owner：「输入框上面的各种停靠卡
   **也没有适配纹理和打光**」）—— 与 subagents / AgentTeam 同一条**绘制顺序**问题：
   官方这几张卡的材质同样画在**自己的 "::before"（z-index: -1）**上
   （真机实测 QueueDock 的 "._7yHdaG_panel::before" = "rgba(61,50,58,.5)"），
   负 z-index 伪元素画在**父元素背景之上**，于是把我们画在父元素 background-image
   上的颗粒与光整个盖住。两层都留：材质画在元素自己身上的场景只有上面那条生效。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
${COMPOSER_CARD_ANCHORS.map(anchor => `${gatedAnchor(anchor)} {
  background-image: ${menuSurfaceLayers()} !important;
}`).join('\n')}
${COMPOSER_CARD_ANCHORS.map(anchor => `${gatedAnchor(anchor)}::before {
  background-image: ${menuSurfaceLayers()} !important;
}`).join('\n')}
/* --- 为什么**不**改这三张卡的几何（owner：「官方处理方式不一样？」—— 是的，确实不一样）---
   owner 连问两次：「官方默认样式为啥有缝了？是咱们改的么？」「还是说，信息队列，todo，
   还有 goal，官方处理方式不一样？」

   **答案：缝隙是官方的，不是我们造的；而且官方对三张卡的处理确实不同。**
   逐条查官方产物（dsh-client-ui-conversation / dsh-client-ui-goal 的 client.js）：

   | 官方组件 | 外边距 | 圆角 | 效果 |
   | :--- | :--- | :--- | :--- |
   | QueueDock 的 .dock / .panel | margin:0 auto calc(0px - stack-gap - 3px) | 12px 12px 0 0 | **收掉间距 + 压进 3px + 下两角直角 → 贴住输入框** |
   | TodoPanel 的 .root | margin:0 auto | 12px（四角圆） | **保留 6px 间距** |
   | GoalBar 的 .dock / .bar | margin:0 auto | 12px（四角圆） | **保留 6px 间距** |

   （上面只写类名的**可读部分**，不抄哈希前缀 —— 本插件红线：产物 CSS 里不得出现哈希类名。）

   间距来自官方的 .composerStack { gap: var(--dsh-composer-stack-gap) }（active 6px）——
   真机在**官方档**下量到 todo-panel→composer 6.0px，所以那是官方自己的设计，不是本插件改的。

   **那为什么我们这边看着更明显？** 官方用 .composerSeat 的**不透明背衬**把那一段盖住了：
   座顶往下 36px 由透明渐到 --dsw-alias-bg-base（官方那条 linear-gradient），
   正好糊住这道 6px。
   而本插件的玻璃层把这条背衬关掉了（background: none，见 glass.ts 的底座规则），
   缝隙于是露出**我们的背景**，读成一道更扎眼的带子。

   **结论：本插件不改这三张卡的几何**（此前两版试过「收掉间距 + 打直底角」，那是照
   QueueDock 的做法推广到了 todo / goal，**与官方不一致**，已整条撤回）。
   真要处理这道缝，该动的是**底座背衬**那条（官方自己的机制），不是卡片几何。

   ## 2026-09-18 复核：曾经推翻过这条，又推回来了
   owner 提过「**改颜色**来区分语义」，据此把三张卡全接上、语义交给颜色。真机复核时 owner
   发现方向不对：「这么连上感觉确实不对了，尤其是 todo，goal，还有对话排队共存的时候，
   都连在一起，**表达的意思一下就变了**。」
   **根因：颜色与间距干的是两件事** —— 颜色标记**单个东西的身份**（这张是提示卡），
   间距标记**分组边界**（这一组到哪里结束）。三张全接上后中间没有任何断点，
   颜色只能说「这是暗金的」，说不出「从这里起不再是提示信息」。**分组边界只有几何能表达。**
   故几何整条退回官方，颜色也不加。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
/* --- 输入框卡片里的**圆形图标按钮**（+ 命令 / 附件）：默认去底、保留 hover 底 ---
   owner：「这两个按钮得适配下，我觉得**像下拉菜单一样，默认底就不要了，保留 hover 底就行**。」
   官方默认底是 var(--dsw-specific-selector) = **不透明实色**，而它们坐在**玻璃卡片**里
   → 读成两块贴在玻璃上的塑料片。置为 transparent 后露出卡片自己的玻璃，材质就统一了。
   官方 hover 走的是**另一个 token**，所以只改这一个即可，hover 天然保留（缘由见
   COMPOSER_ICON_BUTTON_SCOPE 的注释）。覆盖范围**收在卡片里**，不外溢。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
${gatedAnchor(COMPOSER_ICON_BUTTON_SCOPE)} {
  --dsw-specific-selector: transparent;
}
/* --- 悬停卡：官方把**面和字都写死了**（面 = 恒深灰字面量、字 = 白 / 浅灰 / 次浅灰，
   全部两轴同值）---
   owner 定案：这张卡应当**跟随主题**（浅色轴 = 浅卡深字），且「**先把官方默认修了，然后再适配咱们的**」。
   所以这是全插件**唯一不带官方默认门**的一条 —— 两个档都修（缘由见 constants.ts 的
   HOVER_CARD_ANCHOR）。面走 ${PANEL_VARIABLE}：官方默认档下它正是官方自己的 layer3，
   那个档下只把「恒深面」掰回主题面，不引入外来色相。 */
${HOVER_CARD_ANCHOR} {
  /* ⚠️ 这条是**唯一不带门**的规则，因此也是唯一「插件 token 层还没就绪时」
     照常生效的规则 —— 必须给面板底色变量一个**官方兜底**：
     它由 tokenOverrides 发出，而 token 层在 status 为 loading 的窗口内（以及
     overrideTokens 抛错后重试成功之前）是**不具备**的。没有兜底时 var() 解析为空，
     再加上 !important 压住官方自己那条，卡片会变成**全透明**（实测计算值为
     全零 alpha），比不生效更糟。
     兜底取官方 layer-3：正是「这个档下本来该有的那个面」，降级方向正确。
     （本段在模板字符串里，注释中既不能出现反引号，也不能出现色值字面量——
     本文件的「不得硬编码色值」守卫是全表扫描、注释也算。） */
  background-color: var(${PANEL_VARIABLE}, var(--dsw-alias-bg-layer-3)) !important;
  background-image: ${surfaceLayers()} !important;
}
/* 字色：官方写死的浅字必须一起换成**主题感知**的 label token，否则浅卡配浅字还是白底白字。
   选择器只能按稳定后缀匹配（哈希类名规矩，见 constants.ts 的 HOVER_CARD_TEXT_TOKENS）。 */
${HOVER_CARD_TEXT_TOKENS.map(({ suffix, token }) => `${HOVER_CARD_ANCHOR} [class*='${suffix}'] {
  color: var(${token}) !important;
}`).join('\n')}
/* --- 模态弹窗**不做玻璃**：它是内容面（列表 / 卡片 / 表格），与上面那批同一套实色抬升面。
   曾经把它做成液态玻璃（把 owner 说的「对话框」误解成模态弹窗），已撤 —— 现在玻璃只留给
   控制层的**输入框**（见 glass.ts 的 GLASS_SPECULAR）。 */
`
}
