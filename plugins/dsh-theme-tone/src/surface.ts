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
 *   `--dsw-specific-tip` = 同一个不透明面板色。覆盖全部消费方，role 有没有都算数；
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
 * | `:has(> [role='listbox'])` | 命令面板**卡片**（`PopupSelectView` 的背景长在祖先上、`role` 在内层视口上） |
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
 * 另把**颗粒补给分组标题条本身**（{@link GROUPED_MENU_TITLE_SELECTOR}）——
 * 否则标题上没颗粒、菜单上有，仍是一层极淡的接缝。
 */
export const GROUPED_MENU_SELECTOR = "body [role='menu']:has([role='group'])"

/**
 * 分组标题条：`<section role='group'>` 的**第一个子元素**（两个选择器都是这么渲染的，
 * 见 `ModelSelect.tsx:338-339` 与 `CodeBuddyModelSelect.tsx:394-395`）。
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
 * 抬升面样式表文本（**兜底通道**）。
 *
 * 只声明两样：**面板底色**（`PANEL_VARIABLE`，与 token 层同一个值）与**图层**。
 *
 * `!important` 的理由：官方写的是 `background:` **简写**（内含 `background-image: none`），
 * 特异度又各写各的（`.list` / `.card` / `.portal .menu` …），无法穷举；压不过就是静默失效。
 * 反过来，因为只动这两样，万一某处锚点没命中，那处也只是一个官方面，不会出现「半截样式」。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildSurfaceCss(): string {
  return `/* ===== dsh-theme-tone 抬升面（菜单 / 对话框）：兜底给硬编码底色的弹层上同一套面 =====
   选择器带 ${PLAIN_ATTR} 门：官方默认下整表不命中（owner：官方默认的都不要动）。 */
${SURFACE_ANCHORS.map(anchor => `${gatedAnchor(anchor)} {
  background-color: var(${PANEL_VARIABLE}) !important;
  background-image: ${surfaceLayers()} !important;
}`).join('\n')}
/* --- 带**粘性分组标题**的菜单：**只去掉顶光**（见 GROUPED_MENU_SELECTOR 的表）---
   两条 owner 反馈夹出来的解：全给图层 → 分组标题显形成横带；全不给 → 「是纯色的」。
   顶光锚在盒子顶部、正好被标题压住，是横带的**唯一来源** → 去掉它；
   颗粒（均匀贴图）与底光（锚盒子底部、与吸顶的标题不相遇）都留着，质感还在。
   随后把**颗粒补给标题条本身**，否则标题上没颗粒、菜单上有，仍留一层极淡的接缝。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
${gatedAnchor(GROUPED_MENU_SELECTOR)} {
  background-image: ${menuSurfaceLayers()} !important;
}
${gatedAnchor(GROUPED_MENU_SELECTOR)} ${GROUPED_MENU_TITLE_SELECTOR} {
  background-image: var(${GRAIN_TILE_VARIABLE}, none) !important;
}
/* --- 输入框上方那三张**停靠卡**（排队 / 目标 / 待办）---
   owner：「**输入框上面那个区域也没适配**，刚才我记得让改了，但是没改。」
   锚点与「为什么画在子元素上」见 COMPOSER_CARD_ANCHORS。 */
${COMPOSER_CARD_ANCHORS.map(anchor => `${gatedAnchor(anchor)} {
  background-color: var(${PANEL_VARIABLE}) !important;
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
  background-color: var(${PANEL_VARIABLE}) !important;
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
