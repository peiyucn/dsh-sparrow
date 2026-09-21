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

/** 色调选择持久化的 settings 命名空间（小写字母 / 数字 / 连字符，`settings.register` 硬要求）。 */
export const SETTINGS_NAMESPACE = 'ui-theme-tone'

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
 * 官方容器属性：右边栏的**浮层宿主**（`position: fixed; z-index: 60`，见
 * `SidebarRight.module.css:115-118`）。
 *
 * ## 为什么它必须单独记账
 *
 * 右栏里的浮动面板要**横跨整列与对话区**，所以官方把它 portal 到 `document.body` —
 * 而「app root 的兄弟不继承 root 的层叠」，于是官方在这里**明写了 60**（注释原话）。
 * 60 < 内容层 81 → **浮动面板会被对话内容盖住**。
 *
 * 这与 owner 报过的两次是**同一类 bug**（顶栏「金光没了」、拖拽条「整没了」），
 * 区别只在于：那两个是「本来压在内容之上却被盖」，这个是「官方层号本来就高于面板，
 * 但低于我们的内容层」—— 按 {@link ABOVE_CONTENT_Z_INDEX} 那条不变式，同样该抬。
 *
 * **取值必须保持官方相对次序**：官方是 `floatHost 60` < `tabMenu 70`，
 * 抬的时候也必须是 `float 82` < `tabMenu 83`，否则会把「标签菜单压在浮动面板之上」的
 * 官方意图反过来。故此处不共用 {@link ABOVE_CONTENT_Z_INDEX}，而是各留一档（见下表）。
 */
export const RIGHT_FLOAT_HOST_ATTR = 'data-sidebar-right-float-host'

/**
 * 抬到内容层之上的第二档（给官方原本就**高于右栏浮层宿主**的层用）。
 *
 * 官方 `position: fixed` 浮层的层号阶梯（查过源码）：
 *
 * | 官方层 | 原 | 抬到 |
 * | :--- | :--- | :--- |
 * | 右栏浮层宿主 `[data-sidebar-right-float-host]` | 60 | {@link ABOVE_CONTENT_Z_INDEX}（82） |
 * | dockkit 标签菜单 `[data-dockkit-tab-menu]` | 70 | **本值（83）** |
 *
 * 菜单 / tooltip 一族官方取 100（`Menu.module.css:35`、`Tooltip.module.css:3` 等），
 * 本来就高于 81，**不用抬**。
 */
export const ABOVE_FLOAT_HOST_Z_INDEX = 83

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
 * | **右栏浮层宿主** `[data-sidebar-right-float-host]` | 60 | 横跨整列的浮动面板（见该常量；**本轮补上**） |
 * | dockkit 标签菜单 `[data-dockkit-tab-menu]` | 70 | 固定定位的浮出菜单，且**必须高于浮动面板**（官方注释明写）→ 取 83 |
 *
 * **已知未收录（低风险，记账）**：`dockkit .dockScrim/.dockHint`（拖拽落点提示，z=10，
 * 只在下方的 dock 区内，没有专用语义属性）。**新增官方浮层时按上表核对。**
 *
 * ⚠️ **一处靠 DOM 次序、不靠层号的脆弱点（推理，未经真机确认）**：
 * 右栏**全屏态**官方是 40、浮层宿主是 60，**浮层在上**；我们两个都抬成 82 → **同号**。
 * 同号时由绘制次序决胜：面板在 `#root` 内，而浮层宿主是 portal 到 `document.body` 的
 * **后插入节点**（`SidebarRight.tsx:332-344`）→ 浮层仍然后画、仍然在上，**结果与官方一致**。
 * 但这依赖「portal 节点排在 `#root` 之后」这一 React 行为，**换实现方式就可能反过来**。
 * 真机上值得专门看一眼「右栏全屏 + 从右栏浮出一个面板」这个组合。
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
 * 只能靠 `<rect opacity>` 预乘（背景层那边是 `::after { opacity: .13 }`）。
 *
 * 数值与背景层一致（`.13`），因为浮层与背景要读成同一种材质；改一处要连另一处一起看。
 */
export const POPUP_GRAIN_DATA_URI
  = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='0.13' filter='url(%23n)'/%3E%3C/svg%3E\")"

/** 颗粒开关的 DOM 属性（`off` 时 `::after` 不渲染）。 */
export const GRAIN_ATTR = 'data-grain'
