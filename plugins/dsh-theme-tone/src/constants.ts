/**
 * dsh-theme-tone 常量：命名空间、槽位坐标、层级与 DOM 标记。
 *
 * 这些值是插件与宿主之间的契约坐标（槽位 id / order、z-index、settings 命名空间），
 * 集中一处便于单测钉住，避免散落的魔术字符串。
 */

/** 插件短名：cordis loader 条目 id 与日志前缀。 */
export const name = 'dsh-theme-tone'

/** npm 包名：client bundle 注册 id，也是 theme 覆盖层的 source。 */
export const PACKAGE_NAME = '@dsh-sparrow/dsh-theme-tone'

/**
 * 色调选择持久化的设置命名空间。
 *
 * 官方 0.1.7 起设置命名空间就是**本插件在 profile 里的条目 id**（`cordis.patch.yml`
 * 的 `insert.id`，与 {@link name} 同值）—— 不再是插件自注册的任意名字。
 * ⚠️ 改名要同步 `cordis.patch.yml`；旧线（0.1.5-rc.2）里叫 `ui-theme-tone`，
 * 升级后旧值不会被自动迁移（见 README「卸载与残留」）。
 */
export const SETTINGS_NAMESPACE = name

/** 设置行文案的 locale 命名空间。 */
export const LOCALE_NAMESPACE = 'theme-tone'

/** 目标槽位：设置 → 常规 的外观区条目槽（list / root）。 */
export const ROW_SLOT = 'settings.general.item'

/** 本行在槽位内的条目 id。 */
export const ROW_ID = 'theme-tone'

/**
 * 本行显示顺序。官方「外观」占 10、「字号」占 11，两个整数都被占了，而列表槽按
 * 数值升序渲染 —— 取 10.5 即落在两者之间，也就是「紧挨官方外观下面」。
 */
export const ROW_ORDER = 10.5

/**
 * 背景层 z-index。官方客户端实测分布：拖拽条 11 / overlayLayer 20 /
 * SidebarRight 40、60 / dockkit 70 / 菜单·tooltip 100–101 /
 * Modal·Settings 1000 / toast·onboarding 1100。
 * 80 切在 dockkit 与菜单之间：应用底 + 左右栏 + 对话区着色，
 * 菜单 / tooltip / 弹窗 / toast 保持官方中性面（瞬时前景不该被环境色污染）。
 */
export const BACKDROP_Z_INDEX = 80

/**
 * **用户内容**（消息正文 / 图片 / 输入框）的层叠高度 —— 抬到背景层**之上**。
 *
 * owner：「用户发的图片，不要有咱们的样式，尤其是颗粒那些。」
 *
 * 背景层是覆盖全屏的 `position: fixed`，压在**所有内容**之上才能给应用底 / 左右栏着色 ——
 * 代价是连**图片也被染色 + 上颗粒**（实测深色轴 `screen` 把测试图红通道 92 → 131）。
 *
 * ## 为什么抬「整个对话容器」而不是「单个 img」
 *
 * 抬单个 `img` 也能免疫（实测 Δ=(0,0,0)），但 `img` 会同时高过**没有 z-index 的输入框**
 * → 图片滚动时会浮在输入框上。而**输入框就在同一个滚动容器里**
 * （`composerSeat > scrollBody[data-conversation-scroll]`），所以**整体抬升**既解决图片，
 * 又天然保住内部的前后序，不会出现覆盖。
 *
 * ## 为什么背景色不受影响
 *
 * 对话区的底色**不是**这个容器画的，而是它的祖先 `root`（`position: relative; z-index: auto`）
 * 画的 —— 那一层仍在背景层之下，**照常着色**。所以观感是：
 * **背景照常有色调与颗粒，内容（正文 / 图片）干净。**
 *
 * ## ⚠️ 输入框一起被豁免是**有意为之**，别改回去
 *
 * 输入框（`composerSeat`）就在这个容器里，所以跟着被豁免。owner 真机定调：
 * 「正好把对话框也给排除了，挺好，否则对话框输入有点影响视线。」
 * 输入框是**注视焦点**，被环境色 + 颗粒压着会干扰输入；它自身的玻璃与 token 着色照旧
 * （见 `glass.ts`），只是不再吃背景层那一层。
 */
export const CONTENT_Z_INDEX = 81

/** 官方容器属性：对话滚动容器（里面同时装着消息与输入框）。 */
export const CONTENT_ATTR = 'data-conversation-scroll'

/** 官方容器属性：右侧面板（文档 / 图片预览在里面，同样不该被染色）。 */
export const RIGHT_PANEL_ATTR = 'data-sidebar-right-panel'

/** 官方容器属性：外壳浮层（遮罩一类，必须始终压在内容之上）。 */
export const SHELL_OVERLAY_ATTR = 'data-shell-overlay'

/**
 * 官方容器属性：dockkit 的标签菜单（`position: fixed; z-index: 70`）。
 * 固定定位的浮出菜单，必须压在内容之上。
 */
export const DOCKKIT_MENU_ATTR = 'data-dockkit-tab-menu'

/**
 * 抬到内容层之上的第二档（给官方原本就**高于右栏面板**的层用）。
 *
 * 官方 `position: fixed` 浮层的层号阶梯（rc.1 查过源码）：
 *
 * | 官方层 | 原 | 抬到 |
 * | :--- | :--- | :--- |
 * | 右栏面板 `[data-sidebar-right-panel]` | 10（全屏 40） | {@link ABOVE_CONTENT_Z_INDEX}（82） |
 * | dockkit 标签菜单 `[data-dockkit-tab-menu]` | 70 | **本值（83）** |
 *
 * 两者必须**一起**抬才能保住官方的相对次序（`dockkit.module.css:538,543` 原话：
 * 从标签打开的菜单绝不能落在面板之下）。dockkit 自己的浮层档
 * （`--dsh-dockkit-float-layer`，默认 60）**不抬**：它在面板的层叠上下文内，随面板一起上移。
 *
 * 菜单 / tooltip 一族官方取 100（`Menu.module.css:35`、`Tooltip.module.css:3` 等），
 * 本来就高于 81，**不用抬**。
 *
 * ⚠️ 0.1.7 起官方删掉了 `[data-sidebar-right-float-host]`（0.1.5 线里 portal 到 body 的
 * 那个 60 浮层宿主），故本档不再有第二个抬升对象，常量也随之只服务标签菜单。
 */
export const TAB_MENU_Z_INDEX = 83

/**
 * 官方容器属性：**列宽拖拽条**（拖它调左右栏 / 对话区宽度）。
 *
 * owner 真机报：「咱们几个色调，把官方这个**调整对话区域的条**给整没了」。
 *
 * ## 官方有**两条**拖拽条，属性不同，必须分别命中
 *
 * | 出处 | 独有属性 | 类 | 官方 z-index |
 * | :--- | :--- | :--- | :--- |
 * | `AppFrame`（左右栏外侧） | —— **只有 `data-side`** | `.handle` | `11` |
 * | `ConversationRoot`（对话区两侧） | **`data-width-handle`** | `.widthHandle` | —— |
 *
 * 两条都是 `position: absolute` + 低 z-index，会被抬到 81 的内容层**整条盖掉**。
 *
 * ## ⚠️ `[data-side]` 不能裸用
 *
 * 官方**三处**挂 `data-side`：上面两条拖拽条、以及 **`Tooltip` 的 `placement`**
 * （`Tooltip.tsx:152`）。裸写 `[data-side]` 会把 tooltip 一起抬起来 —— 那是误伤。
 * 所以：
 * * `ConversationRoot` 那条用**它独有的** `data-width-handle`；
 * * `AppFrame` 那条没有独有属性，只能 `[data-side]` **再排除掉 tooltip**
 *   （tooltip 本身就是浮层，`role='tooltip'`）。
 */
export const WIDTH_HANDLE_ATTR = 'data-width-handle'

/** @see WIDTH_HANDLE_ATTR */
export const SIDE_ATTR = 'data-side'

/**
 * 必须始终压在**用户内容之上**的官方层（内容抬到 81 后，它们跟着抬到 82）。
 *
 * ## 这是一条**不变式**，不是几张补丁
 *
 * 内容层是**正 z-index 的定位元素**（见 {@link CONTENT_Z_INDEX}），按 CSS 绘制顺序
 * （Appendix E 第 7 步）它会盖掉一切 **z-index 更小** 的层 —— 包括官方那些
 * 「本来压在内容之上」的 chrome。所以：
 *
 * > **凡 z-index < 81 且要压在内容之上的官方层，都必须抬到 82。**
 *
 * 已收录（逐个查过官方源码的 z-index）：
 *
 * | 官方层 | 原 z-index | 抬它的原因 |
 * | :--- | :--- | :--- |
 * | 对话顶栏 `[data-slot='conversation.session.header'] > *` | 9 | 内容会盖住玻璃顶栏（**owner 真机报的 bug**） |
 * | 右栏面板 `[data-sidebar-right-panel]` | 10（全屏 40） | 展开时压在中列之上 |
 * | **左右栏拖拽条** `[data-side]:not([role='tooltip'])` | 11 | **owner 真机报「调整对话区域的条整没了」** |
 * | **对话区拖拽条** `[data-width-handle]` | —— | 同上（它没有独有属性） |
 * | 外壳浮层 `[data-shell-overlay]` | 20 | 拖拽 / 遮罩层 |
 * | dockkit 标签菜单 `[data-dockkit-tab-menu]` | 70 | 固定定位的浮出菜单，且**必须高于右栏面板**（官方注释明写）→ 取 83 |
 *
 * **已知未收录（低风险，记账）**：`dockkit .dockScrim/.dockHint`（拖拽落点提示，z=10，
 * 只在下方的 dock 区内，没有专用语义属性）。**新增官方浮层时按上表核对。**
 *
 * ⚠️ **0.1.7 起原先那条「同号靠绘制次序决胜」的脆弱点已不存在**：官方删掉了 portal 到
 * `document.body` 的右栏浮层宿主（`[data-sidebar-right-float-host]`），右栏整块归 dockkit
 * 布局，浮层档（`--dsh-dockkit-float-layer`，默认 60）在面板的层叠上下文内，随面板一起上移。
 * 仍建议真机看一眼「右栏全屏 + 从右栏浮出一个面板」这个组合（本版未实测）。
 */
export const ABOVE_CONTENT_Z_INDEX = 82

/** 背景层元素与 <style> 的标记属性（HMR / 重载去重 + 卸载清理的唯一抓手）。 */
export const MARKER_ATTR = 'data-dsh-theme-tone'

/**
 * 「当前轴上选的是官方默认」的 body 标记属性。**有它 = 这一轴插件完全不介入。**
 *
 * owner 口径：「官方默认的都不要动，也有个参考，给用户一个完全不动的选择。」
 *
 * token 那层本来就干净（官方默认发的是 `var(--dsw-static-…)` 原值 / 官方字面量，逐字符等于
 * 官方自己的绑定），会破这条的只有两个**与色调无关**的功能：
 *
 * * **玻璃效果**（顶栏浮层 + 输入框）—— 官方默认下顶栏不该浮、输入框不该半透明；
 * * **浮层表面绘制**（填充 + 光 / 纵深 / 颗粒）—— 官方默认下弹层该是官方那个抬升档。
 *
 * 所以这两张表的每条规则都带 `body:not([data-dsh-theme-tone-plain])` 前缀；属性由 client 在
 * `paintLayer` 里按 `backdropPlan(...).hidden` 打上 / 摘掉（整层隐藏 == 这一轴没有染色 == 官方默认），
 * 卸载时一并摘掉。**两张表的 CSS 仍然注入**（静态、可测），只是选择器不命中。
 */
export const PLAIN_ATTR = 'data-dsh-theme-tone-plain'

/**
 * 「输入框卡片此刻是**未选工作区**的待启动态」的 body 标记属性。
 *
 * 那个状态下官方会在卡片上加 `.…_cardWorkspaceTrigger`，靠 `::after` 画一圈**虚线圆角框**，
 * 并**同时把 `--dsw-elevation-stroke-color` 设成 `transparent`** —— 即官方刻意让虚线框
 * 成为那唯一的边界（`InputBar.module.css`：`cardWorkspaceTrigger` 规则组）。
 *
 * 而本插件的玻璃给卡片**无条件**加了悬浮投影 + 内嵌边光，于是**两套边缘语言叠在一起**
 * （owner：「描边就有点不和谐了」）。方案：这个状态下撤掉我们的边光与悬浮投影，
 * 把边界让回官方那条虚线（owner 定案 2026-09-20）。
 *
 * ## 为什么必须是行为探针，而不是 CSS 选择器
 *
 * 官方那条类名是 CSS-module 哈希（形如 `uV2eYG_cardWorkspaceTrigger`，每次构建都变），
 * 仓库红线禁止写哈希类名。而它同时写入的语义属性**都不可用** —— 实测普通态下这三个
 * 选择器**全部误命中**（被本插件的模型触发器 / 附件按钮 / 输入框污染）：
 *
 * | 候选 | 普通态 | 被谁污染 |
 * | :--- | :--- | :--- |
 * | `:has([aria-haspopup='menu'])` | true | 本插件的 `ccb-model-trigger` |
 * | `:has([aria-haspopup])` | true | 附件按钮（listbox）/ 权限按钮（dialog） |
 * | `:has([contenteditable])` | true | 输入框本身 |
 *
 * 所以改由 client 在 JS 里读卡片 `::after` 的计算值 —— 那条虚线的两个签名
 * （`content` 非 `none` **且** `mask-image` 含 `stroke-dasharray`）在任何主题下都成立，
 * 且与类名无关。判定逻辑是纯函数（见 `src/workstart.ts`），有单测。
 */
export const WORKSTART_ATTR = 'data-dsh-theme-tone-workstart'


/** 背景层元素的类名。 */
export const BACKDROP_CLASS = 'dsh-theme-tone'

/** 顶部径向染色的 CSS 变量名。 */
export const TOP_VARIABLE = '--dsh-theme-tone-top'

/** 底部径向染色的 CSS 变量名。 */
export const BOTTOM_VARIABLE = '--dsh-theme-tone-bottom'

/** 左侧金色过渡（额外一层）的 CSS 变量名。 */
export const LEFT_VARIABLE = '--dsh-theme-tone-left'

/**
 * **浮层面板底色**的 CSS 变量名 —— 所有弹出来的框共用的那一档填充。
 *
 * 为什么要单独一个变量：浮层的填充必须**只有一处事实来源**。它同时要被两条路读到 ——
 * ① 走 token 的弹层（`--dsw-specific-menu` 等，见 `tones.ts` 的 `POPUP_TOKENS`）；
 * ② 自带硬编码底色的弹层（本仓库其它插件那些 `role=` 弹层，靠 `surface.ts` 的选择器兜住）。
 * 两条路都读这一个值，颜色才不会又分叉。
 *
 * 注意本变量是**纯色**：图层（颗粒 / 顶光 / 底光）由 `surface.ts` 单独叠，理由见
 * `POPUP_TOKENS` 的注释 —— 百分比渐变按元素盒子缩放，粘性分组标题那种小条会被压成金带。
 */
export const PANEL_VARIABLE = '--dsh-theme-tone-panel'

/**
 * 浮层颗粒贴图的 CSS 变量名。
 *
 * 与 {@link GRAIN_ATTR}（层上的开关属性）**不是一回事**：那个是「要不要叠」，
 * 这个是「叠哪张图」。浮层用 `background-image` 承载颗粒，而背景图层没有独立的
 * `opacity`，所以强度只能烘进贴图里 —— 于是浮层需要**另一张**贴图
 * （见 {@link POPUP_GRAIN_DATA_URI}），由色调的 `grain` 开关在本变量与 `none` 之间切换。
 */
export const GRAIN_TILE_VARIABLE = '--dsh-theme-tone-grain-tile'

/**
 * **颗粒强度** —— 全插件**唯一来源**（每轴一档）。
 *
 * owner 2026-09-24：「噪点值统一变量，方便后续我们减弱」。
 * 改这一个对象，下面三处一起变：
 *
 * 1. 运行期变量 {@link GRAIN_ALPHA_VARIABLE}（所有**伪元素**颗粒层的 `opacity`）；
 * 2. 浮层贴图里烘的 alpha（`grainTileUri`，`background-image` 图层没有独立 opacity，只能预乘）；
 * 3. 由 1、2 派生的一切（背景层 / 右栏 / 弹层 / 设置行）。
 *
 * ## 2026-09-27：深色轴降到 **0.0975**（= 原 0.13 的 75%）
 *
 * owner：「现在所有噪点是统一的配置么？我想把噪点往下降一点。」
 * 确认为统一配置后按 75% 档下调（真机 8× 放大逐档对比选出，见下表）。
 *
 * 实测（真机 violet 深色档，对话列内最干净的一块 96×96 无文字区域，8× 放大取样）：
 *
 * | alpha | 均值（亮度） | 标准差（纹理） | 相对原值 |
 * | ---: | ---: | ---: | :--- |
 * | 0.13（原） | 23.88 | 2.321 | — |
 * | **0.0975（本值）** | **21.26** | **1.753** | 纹理 −24% |
 * | 0.065 | 18.59 | 1.249 | 纹理 −46% |
 * | 0.0455 | 16.86 | 0.934 | 纹理 −60% |
 * | 0（关） | 12.00 | 0.028 | 无 |
 *
 * ⚠️ **深色轴降强度会同时压暗底色**（23.88 → 21.26）—— 这是 `screen` 加法混合的
 * 物理必然（见下），不是取值没调好。要「纹理变淡但底色不变」得另配底色补偿，
 * 那是另一套改法，本轮没做。
 *
 * 浅色轴**本次不动**（`.16`）。
 *
 * ## 为什么两轴取值不同
 *
 * 两个轴的颗粒**方向相反**：深色轴 `screen` 是**加亮**（白点在暗底 = 星光），
 * 浅色轴只能 `multiply` 压暗，而近白底往上只剩几级余量、纹理只能往下刻。
 * 实测（真机同一无 UI 区域，整体亮度 / 高频质感）：深 `.13` → 3.369；浅 `.16` → 240.1 / 2.129。
 */
export const GRAIN_ALPHA: Readonly<Record<'light' | 'dark', number>> = Object.freeze({ light: 0.16, dark: 0.0975 })

/**
 * 颗粒强度的**运行期变量**（由色调层写到 `body` 上）。
 *
 * 伪元素那种「贴图 + 独立 opacity」的颗粒层直接读它；贴图预乘那一路由
 * {@link GRAIN_ALPHA} 在同一处派生。**两路同源**，所以 `GRAIN_ALPHA` 仍是唯一旋钮。
 */
export const GRAIN_ALPHA_VARIABLE = '--dsh-theme-tone-grain-alpha'

/**
 * **视口相位的定位区原点**（由 client half 实测后写到 `body` 上）。
 *
 * 座底不透带与卡片缺口两条规则要用「显式视口相位」替代
 * `background-attachment: fixed`（理由见 `docs/spec/10-fixed-attachment-cost.md`：
 * `fixed` 每帧按视口栅格化，是滚动卡顿的主因）。
 *
 * ## 每个载体两个量：定位区左缘 / 上缘距视口
 * | 变量 | 含义 |
 * | :--- | :--- |
 * | {@link PHASE_BAND_VARIABLE} / {@link PHASE_BAND_TOP_VARIABLE} | 座底带（座位自身）的左缘 / 上缘距视口 |
 * | {@link PHASE_NOTCH_VARIABLE} / {@link PHASE_NOTCH_TOP_VARIABLE} | 卡片缺口（**卡片**，伪元素与它同宽同左）的左缘 / 上缘距视口 |
 *
 * 相位声明把它们当**长度**用（`calc(0px - var(…))`），把图片左上角钉回**视口左上角** ——
 * 这正是 `fixed` 的语义，且与元素自身宽高**完全无关**。
 * 于是 CSS 侧不必为了相位改任何盒子几何（盒子保持修复前的样子 ⇒ 视觉零变化），
 * 也不再需要「元素下缘贴视口底」这类会随状态漂移的前提。
 *
 * ## 为什么必须运行期测
 * 右栏折叠时纯 CSS 尚能推（`100vw − var(--dsh-conversation-column-width)`）；
 * **右栏一开就推不出** —— 左栏偏移与右栏宽同时变，一个方程两个未知量
 *（实测该载体左缘仍是 280、但右缘从 2873 变 1577）。
 * 而官方把右栏宽只写成 `gridTemplateColumns` 内联样式、**没有发布成 CSS 变量**，
 * 且面板宽写在面板自己的 inline style 上、**不继承**到座上 ⇒ 纯 CSS 读不到。
 * 故改为测量：**测到就用快档，所有布局状态一视同仁**（不再有「右栏开着不生效」）。
 *
 * ## ⚠️ 测的必须是**载体自己**的原点
 * `background-position` 的长度相对**元素自身**的定位区解析。缺口伪元素是**卡片宽**的
 *（`left: calc(50% − 卡片宽/2)` + `width: 卡片宽`），而它的宿主（卡的父元素）是**全宽**的
 * —— 两者差一个大内边距。拿宿主去算会偏 800 多像素（本轮真犯过）。故按**卡片**矩形取。
 *
 * ## 与属性的分工（都不可省）
 * * **属性**（{@link PHASE_BAND_ATTR} / {@link PHASE_NOTCH_ATTR}）是**门**：
 *   只在测到有效值时挂。没挂 = 该条相位档整条不命中 = 落回 `fixed` 档。
 * * **变量**是**值**：门开着时它必有值（同一次写入），故 CSS 里不必带回退值
 *   （带回退反而危险：变量缺失时 `background-position` 会退成 `0% 0%` = **错位**，不是降级）。
 */
export const PHASE_BAND_VARIABLE = '--dsh-theme-tone-phase-band'
/** 座底带定位区上缘到视口上缘的距离。 */
export const PHASE_BAND_TOP_VARIABLE = '--dsh-theme-tone-phase-band-top'
/** 卡片缺口载体（卡片自身）左缘到视口左缘的距离。 */
export const PHASE_NOTCH_VARIABLE = '--dsh-theme-tone-phase-notch'
/** 卡片缺口载体（卡片自身）上缘到视口上缘的距离。 */
export const PHASE_NOTCH_TOP_VARIABLE = '--dsh-theme-tone-phase-notch-top'

/**
 * 相位量的**收敛重测上限**（帧）。
 *
 * 相位量必须在布局**稳定后**取，而右栏开合是动画（改 `grid-template-columns` 内联样式，
 * 既不触发 `window.resize` 也可能不落在 `ResizeObserver` 的最后一帧上）。
 * 于是测量做成「连续两帧结果相同才停」的收敛循环 —— 本常量是它的**兜底上限**，
 * 防止持续动画（如拖拽条被拖住不放）导致后台无限轮询。
 *
 * 取 120 帧（约 1 秒 @120Hz）：足够覆盖右栏开合的过渡时长，又不至于长期占帧。
 */
export const PHASE_SETTLE_FRAMES = 120

/**
 * **视口相位档的开关属性**（挂在 `document.body` 上）—— **每个载体一道门**。
 *
 * 座底不透带与卡片缺口是**两个不同的定位区**，几何各自独立：
 * 可能一个测得到、另一个测不到（例如 hero 下没有会话座、卡片未渲染时没有缺口）。
 * 故各给一道门：
 *
 * | 属性 | 管哪条规则 | 配套变量 |
 * | :--- | :--- | :--- |
 * | {@link PHASE_BAND_ATTR} | 座底不透带 | {@link PHASE_BAND_VARIABLE} / {@link PHASE_BAND_TOP_VARIABLE} |
 * | {@link PHASE_NOTCH_ATTR} | 卡片缺口 | {@link PHASE_NOTCH_VARIABLE} / {@link PHASE_NOTCH_TOP_VARIABLE} |
 *
 * 挂了 → 该条规则改用 `scroll` + 显式相位（快）；没挂 → 该条落回
 * `background-attachment: fixed`（慢、但任何布局状态都正确）。
 *
 * ⚠️ **合成一道门是不行的**：那会变成「一个载体暂不可用 ⇒ 另一个也被拖回慢档」。
 * ⚠️ **为什么必须用属性当门，而不是「变量缺失即降级」**：相位档里的 `var()` 不带回退值，
 * 变量缺失时 `background-position` 会在计算值阶段整条失效、退成 `0% 0%` ——
 * 那是**错位**，不是降级。用属性当门则「没测到 ⇒ 整条不命中」，天然安全；
 * 也与本插件既有的 `PLAIN_ATTR` / `WORKSTART_ATTR` / `GRAIN_ATTR` 同一套做法。
 *
 * ⚠️ **两门必须分开**：合成一道门时，只要有一个载体没测到就得整档放弃，
 * 于是「缺口宿主暂时不在」会连带把**已经能测到的座底带**也拖回慢档。
 *
 * ⚠️ **不许退到 `documentElement`**：消费侧选择器写的是 `body[...]`，
 * 挂错宿主会让门恒不命中（相位永不生效）。
 */
export const PHASE_BAND_ATTR = 'data-dsh-theme-tone-phase-band'
/** 卡片缺口相位档的开关属性。 */
export const PHASE_NOTCH_ATTR = 'data-dsh-theme-tone-phase-notch'

/**
 * **悬停卡锚点**（`HoverCard`，左边栏会话 hover 那张 244px 预览卡）。
 *
 * 它从 {@link SURFACE_ANCHORS} 里单独摘出来，因为它要**破两条规矩**，两条都是 owner 明确定的口径：
 *
 * ## ① 它必须**跟随主题**，不能是恒深卡
 *
 * 官方把这张卡的**面和字都写死了**：
 * * 面 —— `HoverCard.module.css:13-21` 组件级字面量 `--dsw-hovercard-bg: #2C2C2E`
 *   （注释 `light/dark identical`，figma 原值）；
 * * 字 —— 消费方 `Rows.module.css:301-335` 一并写死（注释 `dark surface, fixed colors both themes`），
 *   `#FFFFFF` / `#CFD3D6` / `#ADB2B8`。
 *
 * 于是浅色轴下官方自己就是**一张深卡**。owner：「**深卡不对吧**」——
 * 这张卡应当和别的浮层一样跟随主题（浅色轴 = 浅卡深字）。
 * 只把面染浅会让固定的浅字变成**白底白字**（owner 真机截图的原始症状），
 * 所以**字色也必须一起换成主题 token**（见 {@link HOVER_CARD_TEXT_TOKENS}）。
 *
 * ## ② 它**不带「官方默认」门**，两个档都修
 *
 * owner：「**我们应该先把官方默认修了，然后再适配咱们的**。」
 * 这是全插件**唯一**一处刻意改官方默认外观的地方 —— 「官方默认的都不要动」那条硬规矩
 * 在这里按 owner 的口径**开一个口子**：它修的是「官方自己把一张卡写死了」这个毛病，
 * 不是我们的色调偏好，所以不该等选了色调才生效。
 *
 * 面走 {@link PANEL_VARIABLE}（官方默认档下它正是官方自己的 layer3，所以那个档下
 * 也不引入外来色相，只是把深面掰回主题面）。
 */
export const HOVER_CARD_ANCHOR = "body > [role='button']"

/**
 * 悬停卡内容的**字色覆盖表** —— 把官方写死的字面量换成**主题感知**的官方 label token。
 *
 * 选择器只能按**稳定后缀**匹配（`[class*='_hoverTitle']`）：官方这些类名是 CSS-module 哈希的
 * （形如 `Sixlwa_hoverTitle`，哈希每次构建都变），仓库规矩禁止直接写哈希类名；
 * 后缀 `_hoverTitle` 是稳定的那一半。owner 已确认走这条路（备选是「整卡统一继承一个正文色」，
 * 那会把标题 / 路径 / 时间 / 状态四级层次压平）。
 *
 * 四级映射维持官方原来的**层次关系**（标题最亮 → 路径/时间次之 → 状态最暗），
 * 只把「恒浅」换成「跟随主题」：
 */
export const HOVER_CARD_TEXT_TOKENS: readonly { suffix: string; token: string }[] = Object.freeze([
  Object.freeze({ suffix: '_hoverTitle', token: '--dsw-alias-label-primary' }),
  Object.freeze({ suffix: '_hoverPath', token: '--dsw-alias-label-secondary' }),
  Object.freeze({ suffix: '_hoverTime', token: '--dsw-alias-label-secondary' }),
  Object.freeze({ suffix: '_hoverStatus', token: '--dsw-alias-label-tertiary' }),
])

/**
 * 浮层（菜单 / 对话框）表面的染色形状。浮层尺寸在「整屏」与「83px 的色调卡」之间，
 * 所以几何取中间档：比整屏铺得开（整屏形状在小面上会全落在盒外），比色调卡收一档。
 *
 * 这三条与 `backdrop.ts` 的 `PREVIEW_*` 是**同一类东西**（同一套配方的另一个尺度），改一处要想另一处。
 *
 * **为什么住在 constants 而不是 backdrop**：token 层（`tones.ts`）也要用它们拼浮层底色，
 * 而 `backdrop.ts` 依赖 `tones.ts` —— 反向引用会成环。这里是几何常量的第二处落点，
 * 只放「token 层也要读到」的那三条，其余几何仍在 `backdrop.ts`。
 *
 * **顶光的高度被 owner 反馈压过一档（55% → 42%）**：「弹出框颜色偏浅了，有点变成军大衣的感觉了」。
 * 根因是**覆盖面积**而不是浓度 —— 浅轴的页面光层 α 当时是 `.28`（为整屏存在感调的），
 * 但同一份浓度铺在浮层上时，55% 的竖直半径让它盖住了顶部约 **30%**，而整屏上只有约 **18%**；
 * 于是整块面成了奶茶色的暖洗，米色叠绿就是卡其（军大衣）。压到 42% 后可见范围约 **20%**，
 * 与整屏的 18% 同量级 —— 回到「一条顶光」而不是「一层色浆」。**浓度一个字没动。**
 *
 * 注：浅色轴的光层后来从暖金改成了**主色**（见 03-palette，中间经过冷白 / 银白两版），这条几何与「军大衣」的
 * 根因判断都不受影响 —— 本色本来就是这个空间的主色，不会引入外来色相。
 */
export const POPUP_TOP_SHAPE = 'ellipse 120% 42% at 50% -12%'
/** 浮层表面底部染色形状（覆盖底部约 27%，与整屏的 ~31% 同量级，未动过）。 */
export const POPUP_BOTTOM_SHAPE = 'ellipse 110% 52% at 50% 112%'

/**
 * 浮层表面**左侧金晕**的形状（2026-09-27 补）—— 对应整屏的 {@link LEFT_RADIAL_SHAPE}。
 *
 * ## 为什么必须补这一条（owner：「设置弹窗的打光和其他的好像不一样……我记得咱们的
 * 深色主题是三道光，应该所有元素都统一」）
 *
 * 实测确认了两件事：
 * 1. 背景层叠的是**三道光**（`BACKDROP_GRADIENTS`：顶 `at 50% -10vh` / 底 `at 50% 112vh` /
 *    左 `at 0% -6vh`），而浮层的 {@link surfaceLayers} 只引用了**顶与底两道** ——
 *    `LEFT_VARIABLE` 在 `surface.ts` 里**一次都没出现**（没 import）。
 * 2. `tones.ts` 的 `LIGHT_TOKENS` **已经把左光发到 `body`** 了，所以浮层其实**继承得到**
 *    这个变量 —— 只差图层串里引用一下。不是「拿不到」，是「没用」。
 *
 * 于是所有浮层（设置弹窗、菜单、对话框…）都比背景少一道左光，观感上「打光不一样」。
 *
 * ## 几何怎么定：与整屏同一「锚左上角」的思路，按浮层尺度缩放
 *
 * 整屏那条是 `ellipse 38vw 58vh at 0% -6vh`（锚视口左上角，让金色铺满左栏）。
 * 浮层很小（几百 px），照抄 `vw/vh` 会让椭圆**远大于盒子**、整块面变成均匀色浆 ——
 * 与 {@link POPUP_TOP_SHAPE} 当初从整屏形状缩下来是同一个理由（见该常量的注释）。
 * 故改为**百分比**几何：锚在盒子左上角（`at 0% 0%`），横向铺满约 42%、竖向约 58%，
 * 与顶光 `42%`、底光 `52%` 的量级一致 ⇒ 读成「角落的一道光」而不是「一层色浆」。
 *
 * 收束沿用 {@link POPUP_STOP}（`transparent 76%`），与另两道同为浮层尺度。
 */
export const POPUP_LEFT_SHAPE = 'ellipse 42% 58% at 0% 0%'

/** 浮层染色的收束位置（比整屏 `62%` 晚、比色调卡 `71%` 还晚一档，小面才读得出渐变）。 */
export const POPUP_STOP = 'transparent 76%'

/**
 * **顶光收束位置的变量名**。
 *
 * 值由 `tones.ts` 的 `TOP_STOP` 发出，**两轴同值**（浅色轴不再有自己的一套几何 ——
 * 方向 / 位置 / 收束点一律照深色轴那束金，两轴严格镜像）。
 *
 * 仍然走 CSS 变量而非写死，是为了：① 与其余几何常量同一处事实来源；
 * ② 背景层 CSS 里能 `var(…, fallback)` 兜底；③ 若将来两轴要再分开，改一处即可。
 */
export const TOP_STOP_VARIABLE = '--dsh-theme-tone-top-stop'

/**
 * **模态弹窗**锚点 —— 走**实色**抬升面，**不做玻璃**。
 *
 * ## 一段被撤掉的弯路（记全，免得再走）
 *
 * owner 说「对话框能不能有苹果那种液态玻璃的质感」，我理解成 `[role='dialog']` 模态弹窗，
 * 于是给它做了玻璃。**理解错了** —— owner 澄清：「**就是我输入对话的对话框啊**」
 * （= 打字的那个输入框，`[data-composer-card]`）。三条症状因此全对上了：
 * 设置 / 云端文件 / 归档三个**模态弹窗**变成了玻璃（其中两个内容还透出来），
 * 而**输入框一动没动**。
 *
 * ## 为什么模态弹窗本来就不该做玻璃（不只是「理解错了」）
 *
 * Apple HIG · Liquid Glass 里有一条**硬规矩**：
 *
 * > **Don't put glass on lists, cards, or media content.**
 * > **Liquid Glass is exclusively for the navigation/control layer floating above content.**
 *
 * 设置 / 云端文件 / 归档都是**内容面**（列表、卡片、表格），做玻璃既违反规范、
 * 又会让内容变透明（owner 的原始反馈）。所以这条弯路撤得**干净**：
 * 弹窗回到与菜单同一套**实色抬升面**，玻璃只留给**控制层**（输入框 / 顶栏）—— 那正是 HIG 说的位置。
 *
 * ## 关于 `aria-modal`（值得留下的一个事实）
 *
 * 排查途中确认过：官方全树带 `aria-modal="true"` 的只有三处（`Modal` 原语 / `SettingsRoot` /
 * `ImageLightbox`），而 `StatsPills` / `TurnUsagePanel` 那两枚小弹层虽然也是 `role='dialog'`、
 * 却**没有**它。将来若真要按「真模态 vs 小弹层」分流，判据是 `aria-modal`，
 * 不是很宽的 `role='dialog'`。**当前不需要**（两类都走实色）。
 */
export const DIALOG_ANCHOR = "body [role='dialog']:not(:has(> img))"

/**
 * 浮层用的颗粒贴图：与背景层同一张 `feTurbulence` 噪声（逐字同参数），
 * **但把强度烘进了 SVG** —— `background-image` 的图层没有独立 `opacity`，
 * 只能靠 `<rect opacity>` 预乘（背景层那边是 `::after { opacity: … }`）。
 *
 * ## ⚠️ 2026-09-27：浮层贴图的强度**必须比背景层低**，不能直接喂 GRAIN_ALPHA
 *
 * owner 真机反馈：「弹出元素还是噪点太重了，和背景不是一个档位……模型选择列表，
 * 背景任务列表，还有其他点击按钮弹出的对话框，hover 出现的对话框等。」
 *
 * **真机实测（本机 3080，模型选择菜单；颗粒贡献 = 颗粒开/关的逐像素平均差）**：
 *
 * | 烘入 alpha | 弹出层颗粒贡献 | 弹出 / 背景 |
 * | ---: | ---: | ---: |
 * | 0.0975（= GRAIN_ALPHA，原做法） | 12.581 | **1.43** |
 * | 0.0780 | 10.268 | 1.17 |
 * | **0.0682（= ×0.7，本值）** | **8.851** | **1.01** |
 * | 0.0585 | 7.907 | 0.90 |
 * | 0.0488 | 6.405 | 0.73 |
 * | 0.0390 | 5.364 | 0.61 |
 *
 * ⚠️ **2026-09-27（M6）：下面这张表与结论都已作废，保留仅为记录走过的弯路。**
 *
 * 旧表（**双层**时代、且浮层与地面**不在同一屏幕位置**上取的样）曾得出
 * 「同一个 alpha 喂给两条路，浮层会重约 43% ⇒ 浮层必须调低」。M6 在同一屏幕位置
 * 重测后结论**相反**：单载体下浮层需要比地面**更强**（k* = 1.23）才对得上。
 * 两个前提都变了（层数 2→1；位置口径 → 同位置），见
 * {@link POPUP_GRAIN_COMPENSATION} 的完整定标表。
 *
 * ## 为什么用「补偿系数」而不是改 GRAIN_ALPHA
 *
 * `GRAIN_ALPHA` 是**背景层**的强度（owner 上一轮在那儿定的 0.0975，有 8× 放大逐档对比）。
 * 浮层要的是「与背景同档」，所以派生关系写成 `GRAIN_ALPHA × POPUP_GRAIN_COMPENSATION`
 * —— 将来 owner 再调 `GRAIN_ALPHA`，两处**一起动且保持同档**，不会又分叉。
 *
 * ⚠️ **深色轴与浅色轴用**同一个系数：实测两轴都是「浮层重约 43%」这一条规律，
 * 而两轴的绝对强度本就不同（`.0975` / `.16`），系数保持共享才不引入第三种自由度。
 *
 * ## ⚠️⚠️ 2026-09-27（M6）：0.7 → 1.23，单载体口径下**重新定标**
 *
 * 0.7 是在**双层**时代的**不同屏幕位置**上定出来的 —— 两个前提在 M2 后都不成立了：
 *
 * 1. **层数变了**：那时每个浮层画两遍（元素级 + `::after`），颗粒贡献是两份之和；
 *    M2 收敛为单载体后只剩一份 ⇒ 弹层实际降到了大约一半。
 * 2. **位置口径不同**（这才是 0.7 偏低的另一半原因）：旧表拿「模型选择菜单上的颗粒」
 *    与「背景层另一处」相比，而两者**不在同一屏幕位置**，光照梯度与背后内容都不同。
 *
 * M6 用**同一屏幕位置**重定标（取样带 = 设置对话框顶部那一条，1887 点）：
 *
 * | 口径 | 浮层贡献 | 地面贡献 | 比值 | k* |
 * | :--- | ---: | ---: | ---: | ---: |
 * | 同位置（本表） | 5.006 | 8.794 | 0.569 | **1.23** |
 * | 7 点扫描（另一次独立测量） | — | — | — | **1.264** |
 *
 * 两种口径互相独立、结果一致（1.23 / 1.26）⇒ 取 **1.23**。
 *
 * ⚠️ **所以「浮层必须比地面弱」这个旧结论是错的**（本注释上一版如此写）：
 * 它成立的前提是「双层 + 位置不同」。单载体、同位置下，浮层的颗粒**需要比地面更强**
 * 才读起来同档 —— 因为地面走 `mix-blend-mode: screen`（深色轴上把噪声**提亮**），
 * 而浮层是普通合成（`normal`），同样的名义 alpha 在浮层上显得更淡。
 *
 * ⚠️ alpha 上限：`0.0975 × 1.23 = 0.1199`，仍远低于 1.0，无溢出风险。
 */
export const POPUP_GRAIN_COMPENSATION = 1.23

/**
 * 浮层颗粒强度（按轴）。
 *
 * 见 {@link POPUP_GRAIN_COMPENSATION}：浮层不能用 `GRAIN_ALPHA` 原值，否则比背景重约 43%。
 *
 * ⚠️ 结果**四舍五入到 4 位小数**：直接乘会得到 `0.06824999999999999` 这种浮点尾数，
 * 而它会被**逐字烘进 data URI**（`opacity='0.06824999999999999'`）—— 既难看、也让
 * 「贴图里的值 == 常量」这类断言变脆。4 位足够（视觉上 1/10000 的差异不可见）。
 * @param scheme - 明暗轴。
 * @returns 该轴烘进浮层贴图的 alpha。
 */
export function popupGrainAlpha(scheme: 'light' | 'dark'): number {
  return Math.round(GRAIN_ALPHA[scheme] * POPUP_GRAIN_COMPENSATION * 1e4) / 1e4
}

/**
 * 构造浮层颗粒贴图（把强度烘进 SVG）。
 * @param alpha - 烘入的 alpha（通常传 {@link popupGrainAlpha} 的结果）。
 * @returns 可直接写进 `background-image` 的 data URI。
 */
export function grainTileUri(alpha: number): string {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='${alpha}' filter='url(%23n)'/%3E%3C/svg%3E")`
}

/**
 * 浮层颗粒贴图（深色轴）—— 由 {@link GRAIN_ALPHA} × {@link POPUP_GRAIN_COMPENSATION} 派生。
 */
export const POPUP_GRAIN_DATA_URI = grainTileUri(popupGrainAlpha('dark'))

/**
 * **浮层三道光相对「地面」的强度补偿** —— owner 2026-09-27 报
 * 「设置页 / 子代理 / 后台任务 / 模型列表的顶光，明显比别的元素强，希望都有元素的顶光强度要统一」。
 *
 * ## 「统一」的判据：**同一屏幕位置上，浮层的 alpha 应等于地面的 alpha**
 *
 * 两道光的配方都是锁定的常量，可直接解析算清楚（不靠像素，可逐字复核）：
 *
 * | | 配方 | 作用盒 |
 * | :--- | :--- | :--- |
 * | 地面（`BACKDROP_GRADIENTS` 第 1 段） | `radial-gradient(ellipse 80vw 45vh at 50% -10vh, C, transparent 62%)` | 视口 1400×900 |
 * | 浮层（`POPUP_TOP_SHAPE`） | `radial-gradient(ellipse 120% 42% at 50% -12%, C, transparent 76%)` | 对话框 800×800 |
 *
 * 其中 `C = rgba(232,162,74,.09)`。以 800×800 对话框（屏幕位置 300,50）逐点解 `alpha浮层 = alpha地面`：
 *
 * | 同一屏幕位置 | 地面 alpha | 浮层 alpha(k=1) | 解出的 k |
 * | :--- | ---: | ---: | ---: |
 * | 对话框顶边中央 (700,50) | 0.03982 | 0.05617 | 0.709 |
 * | 对话框顶边左 1/4 (500,50) | 0.01785 | 0.03017 | 0.592 |
 * | 对话列顶部中央 (700,10) | 0.05416 | 0.07026 | 0.771 |
 *
 * ⇒ **k\* ≈ 0.69**。取 **0.7** —— 与顶栏那条路的 {@link GLASS_HEADER_ALPHA} 同值。
 * 两者理由不同（顶栏是「按自己的填充 alpha 同步压」，浮层是「与地面等 alpha」），
 * 但落到同一个数，所以这里直接写明这层巧合，将来调一处时能立刻想到另一处。
 *
 * ## 与实测交叉验证（解析模型可信）
 *
 * 峰值口径实测（本机 3080，对话框顶部带 4000+ 空白点，只切变量的逐像素平均差）：
 * `k=0.33` 时浮层/地面 = **0.48**；解析模型在同一点预测 `0.47` —— 两种独立方法吻合。
 *
 * ## ⚠️ 记一次我自己踩的坑（保留，免得后人重走）
 *
 * 第一版我把系数定成了 `0.33`，依据是一条「浮层比地面强 3.03 倍」的扫描。
 * 那条扫描**是错的**，两处量具缺陷叠加：
 * 1. 只覆盖了**元素级**那条规则，`::after` 仍是满强度 ⇒ 量到的只是半层的贡献；
 * 2. 拿「浮层三道光的总和」去比「地面只顶光」，分子分母不同口径。
 * 修正后（两层一起覆盖 + 同口径）结论完全反过来：浮层在 `k=1` 时只比地面强约 1.4 倍，
 * 而非 3 倍。**教训：A/B 之前先确认「两边的口径与覆盖范围一致」**，否则数字再稳定也是错的
 * （那版扫描每档重复两次都完全一致、且单调 —— 稳定 ≠ 正确）。
 */
export const POPUP_LIGHT_COMPENSATION = 0.7

// ⚠️ 这里曾有一条 `POPUP_GRAIN_DATA_URI_LIGHT = grainTileUri(GRAIN_ALPHA.light)`，
// 已删除（2026-09 审计：全仓零引用）。浅色轴的贴图由 tones.ts 在运行时按 scheme
// 现算 `grainTileUri(GRAIN_ALPHA[scheme])` —— 那条常量既不是唯一来源、也没有消费者，
// 留着只会让下一个维护者以为「浅色轴走的是另一条路径」。

/** 颗粒开关的 DOM 属性（`off` 时 `::after` 不渲染）。 */
export const GRAIN_ATTR = 'data-grain'
