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

/** 色调选择持久化的设置命名空间 = 本插件在 profile 里的条目 id（`cordis.patch.yml` 的 `insert.id`，
 *  与 {@link name} 同值，官方 0.1.7 起的口径）—— ⚠️ 改名要同步 `cordis.patch.yml`，
 *  且旧值不会自动迁移（见 README「卸载与残留」）。 */
export const SETTINGS_NAMESPACE = name

/** 设置行文案的 locale 命名空间。 */
export const LOCALE_NAMESPACE = 'theme-tone'

/** 目标槽位：设置 → 常规 的外观区条目槽（list / root）。 */
export const ROW_SLOT = 'settings.general.item'

/** 本行在槽位内的条目 id。 */
export const ROW_ID = 'theme-tone'

/** 本行显示顺序：官方「外观」占 10、「字号」占 11，而列表槽按数值升序渲染 ⇒ 10.5 落在两者之间。 */
export const ROW_ORDER = 10.5

/** 背景层 z-index，取 80：切在 dockkit（70）与菜单·tooltip（100）之间 —— 应用底 + 左右栏 + 对话区
 *  着色，菜单 / 弹窗 / toast 保持官方中性面（瞬时前景不该被环境色污染）。 */
export const BACKDROP_Z_INDEX = 80

/** **用户内容**（正文 / 图片 / 输入框）的层叠高度 —— 抬到背景层**之上**，否则连图片都被染色上颗粒。
 *  抬**整个对话容器**而不是单个 `img`：`img` 会高过没有 z-index 的输入框、滚动时浮在它上面；
 *  对话区底色由祖先 `root` 画、仍在背景层之下，照常着色。
 *  ⚠️ **输入框一起被豁免是有意为之，别改回去**：它是注视焦点，被环境色 + 颗粒压着会干扰输入。 */
export const CONTENT_Z_INDEX = 81

/** 官方容器属性：对话滚动容器（里面同时装着消息与输入框）。 */
export const CONTENT_ATTR = 'data-conversation-scroll'

/** 官方容器属性：右侧面板（文档 / 图片预览在里面，同样不该被染色）。 */
export const RIGHT_PANEL_ATTR = 'data-sidebar-right-panel'

/** 官方容器属性：外壳浮层（遮罩一类，必须始终压在内容之上）。 */
export const SHELL_OVERLAY_ATTR = 'data-shell-overlay'

/** 官方容器属性：dockkit 的标签菜单（固定定位的浮出菜单，必须压在内容之上）。 */
export const DOCKKIT_MENU_ATTR = 'data-dockkit-tab-menu'

/** 抬到内容层之上的第二档（给官方原本就**高于右栏面板**的层用）：右栏面板 10（全屏 40）、dockkit 标签
 *  菜单 70，两者必须**一起**抬才保住官方相对次序（从标签打开的菜单绝不能落在面板之下）⇒ 82 / 83。
 *  dockkit 自己的浮层档（默认 60）不抬（在面板的层叠上下文内）；菜单 / tooltip 取 100，本就高于 81。 */
export const TAB_MENU_Z_INDEX = 83

/** **账号通知 stack** 的 z-index：官方给 40（高于右栏面板 10、与全屏面板 40 同级），但本插件把背景层 /
 *  内容层 / 右栏抬到 80 / 81 / 82 ⇒ 40 会被整层压住（表现为：通知被内容层遮挡、且被半透明背景层染色，
 *  即「条本身能看出来、融不进背景」）。按官方「通知浮在应用之上」的意图抬到 83（与 dockkit 标签菜单同档，
 *  仍低于菜单 / tooltip 的 100）。 */
export const NOTICE_Z_INDEX = 83

/** 官方容器属性：**列宽拖拽条**。官方有**两条**、必须分别命中：`AppFrame` 那条只有 `data-side`，
 *  `ConversationRoot` 那条独有 `data-width-handle`；两条都是 `absolute` + 低 z-index，会被 81 的内容层整条盖掉。 */
export const WIDTH_HANDLE_ATTR = 'data-width-handle'

/** ⚠️ `[data-side]` **不能裸用**：官方三处挂它 —— 上面两条拖拽条 + **`Tooltip` 的 `placement`**，
 *  裸写会把 tooltip 一起抬起来（误伤）⇒ 必须再排除 `[role='tooltip']`。@see WIDTH_HANDLE_ATTR */
export const SIDE_ATTR = 'data-side'

/** 必须始终压在**用户内容之上**的官方层 —— **这是一条不变式**：内容层是正 z-index 的定位元素、
 *  会盖掉一切更小的层，故凡 z-index < 81 且要压在内容之上的官方层都得抬到 82。
 *  已收录：对话顶栏 9、右栏面板 10（全屏 40）、左右栏 / 对话区拖拽条 11、外壳浮层 20、dockkit 标签菜单 70（→ 83）。
 *  ⚠️ 已知未收录（低风险）：dockkit `.dockScrim` / `.dockHint`（z=10，只在下方 dock 区内）；新增官方浮层时按此核对。 */
export const ABOVE_CONTENT_Z_INDEX = 82

/** 背景层元素与 <style> 的标记属性（HMR / 重载去重 + 卸载清理的唯一抓手）。 */
export const MARKER_ATTR = 'data-dsh-theme-tone'

/** 「当前轴上选的是官方默认」的 body 标记属性 —— **有它 = 这一轴插件完全不介入**（给用户一个完全不动
 *  的参考）。会破这条的只有玻璃效果与浮层表面绘制这两个与色调无关的功能 ⇒ 那两张表每条规则都带
 *  `body:not([本属性])` 前缀；属性由 client 的 `paintLayer` 打上 / 摘掉，CSS 仍注入（只是不命中）。 */
export const PLAIN_ATTR = 'data-dsh-theme-tone-plain'

/** 「输入框卡片此刻是**未选工作区**的待启动态」的 body 标记属性 —— 该状态下撤掉本插件给卡片加的悬浮投影
 *  与内嵌边光，把边界让回官方那条虚线框。必须是**行为探针**：官方那个类名是 CSS-module 哈希，而它同时
 *  写入的语义属性在普通态下**全部误命中**（`aria-haspopup` / `contenteditable` 都被卡片里别的控件占着）
 *  ⇒ client 改读卡片 `::after` 的计算值（`content` 非 `none` 且 `mask-image` 含 `stroke-dasharray`）。 */
export const WORKSTART_ATTR = 'data-dsh-theme-tone-workstart'


/** 背景层元素的类名。 */
export const BACKDROP_CLASS = 'dsh-theme-tone'

/** 顶部径向染色的 CSS 变量名。 */
export const TOP_VARIABLE = '--dsh-theme-tone-top'

/** 底部径向染色的 CSS 变量名。 */
export const BOTTOM_VARIABLE = '--dsh-theme-tone-bottom'

/** 左侧金色过渡（额外一层）的 CSS 变量名。 */
export const LEFT_VARIABLE = '--dsh-theme-tone-left'

/** **浮层面板底色**的 CSS 变量名 —— 所有弹出来的框共用的那一档填充，必须**只有一处事实来源**：
 *  走 token 的弹层与自带硬编码底色的弹层（`surface.ts` 的选择器）都读它，颜色才不会分叉。
 *  它是**纯色**（三道光由 `surface.ts` 单独叠 —— 渐变按元素盒子缩放，小条会被压成金带）。 */
export const PANEL_VARIABLE = '--dsh-theme-tone-panel'

/*
 * ===== 颗粒（tone grain）已于 2026-10-22 移除 =====
 *
 * 原先每个色调可叠一层噪声纹理（`::after` + SVG feTurbulence 贴图 + `mix-blend-mode`）。
 * 移除理由（owner 实机确认）：
 *  ① 性能：颗粒层是全插件 4 处 `mix-blend-mode: screen` 的载体之一，滚动时参与每帧合成；
 *     去掉后 owner 反馈「有明显改善」。
 *  ② 观感：owner 反馈「没有颗粒似乎视觉效果更好」—— 暗色底上那层噪声反而让大面积留白显脏。
 *
 * ⇒ 不再有开关：这些标识符**整族删除**（`GRAIN_ALPHA` / `GRAIN_TILE_VARIABLE` /
 *   `GRAIN_ALPHA_VARIABLE` / `GRAIN_ATTR` / `POPUP_GRAIN_*` / `grainTileUri`）。
 *   若将来要加回纹理，**不要**照抄旧的「贴图 + opacity + screen」那一套：
 *   先读 `docs/spec/13-running-sweep-cost.md` 里关于全屏混合与滚动合成的实测结论。
 */

/** **视口相位的定位区原点**（由 client half 实测后写到 `body` 上）—— 座底不透带与卡片缺口两条规则用它替代

/** **视口相位的定位区原点**（由 client half 实测后写到 `body` 上）—— 座底不透带与卡片缺口两条规则用它替代
 *  `background-attachment: fixed`（`fixed` 每帧按视口栅格化，是滚动卡顿的主因，见 docs/spec/10）：每个载体两个量（定位区左缘 / 上缘距视口），相位声明当**长度**用（`calc(0px - var(…))`）把图片左上角钉回**视口左上角**（正是 `fixed` 的语义，且与元素自身宽高无关，CSS 侧不必改任何盒子几何）。
 *  ⚠️ 必须运行期测（右栏一开，左栏偏移与右栏宽同时变，官方也没把右栏宽发布成 CSS 变量），且测的必须是**载体自己**的原点 —— `background-position` 相对元素自身解析，而缺口伪元素是**卡片宽**、宿主是全宽的，拿宿主算会偏 800 多像素。
 *  ⚠️ **变量是值、属性是门**（见下方两道门）：CSS 里不带回退，因为变量缺失时 `background-position` 会退成 `0% 0%` = **错位**（不是降级）；门没挂 = 整条不命中，才是安全的降级。 */
export const PHASE_BAND_VARIABLE = '--dsh-theme-tone-phase-band'
/** 座底带定位区上缘到视口上缘的距离。 */
export const PHASE_BAND_TOP_VARIABLE = '--dsh-theme-tone-phase-band-top'
/** 卡片缺口载体（卡片自身）左缘到视口左缘的距离。 */
export const PHASE_NOTCH_VARIABLE = '--dsh-theme-tone-phase-notch'
/** 卡片缺口载体（卡片自身）上缘到视口上缘的距离。 */
export const PHASE_NOTCH_TOP_VARIABLE = '--dsh-theme-tone-phase-notch-top'

/** 相位量的**收敛重测上限**（帧）：测量是「连续两帧结果相同才停」的收敛循环（右栏开合改的是内联
 *  `grid-template-columns`，既不触发 `window.resize` 也可能不落在 `ResizeObserver` 最后一帧上），
 *  本常量是它的**兜底上限**，防止持续动画（如拖拽条被拖住不放）导致后台无限轮询。 */
export const PHASE_SETTLE_FRAMES = 120

/** **视口相位档的开关属性**（挂在 `document.body` 上）—— **每个载体一道门**：座底不透带与卡片缺口是
 *  两个不同的定位区，可能一个测得到、另一个测不到（hero 下没有会话座、卡片未渲染时没有缺口）。
 *  门挂了 → 该条改用 `scroll` + 显式相位（快）；没挂 → 落回 `fixed`（慢但任何布局状态都正确）。
 *  ⚠️ **合成一道门不行**：那会变成「一个载体暂不可用 ⇒ 另一个也被拖回慢档」。
 *  ⚠️ **不许退到 `documentElement`**：消费侧选择器写的是 `body[...]`，挂错宿主会让门恒不命中。 */
export const PHASE_BAND_ATTR = 'data-dsh-theme-tone-phase-band'
/** 卡片缺口相位档的开关属性。 */
export const PHASE_NOTCH_ATTR = 'data-dsh-theme-tone-phase-notch'

/** **悬停卡锚点**（`HoverCard`，左边栏会话 hover 那张 244px 预览卡）—— 单列出来，因为它要**破两条规矩**：
 *  ① 官方把这张卡的**面和字都写死了**（两轴同值，浅色轴下官方自己就是一张深卡）⇒ 必须跟随主题，
 *  且**字色也得一起换成主题 token**，否则白底白字（见 {@link HOVER_CARD_TEXT_TOKENS}）；
 *  ② 它是全插件**唯一**一处刻意改官方默认外观的地方、**不带「官方默认」门**（修的是「官方自己把一张卡
 *  写死了」，不是色调偏好）。面走 {@link PANEL_VARIABLE}：官方默认档下它正是官方自己的 layer3。 */
export const HOVER_CARD_ANCHOR = "body > [role='button']"

/** 悬停卡内容的**字色覆盖表** —— 把官方写死的字面量换成**主题感知**的官方 label token。选择器只能按
 *  **稳定后缀**匹配（`[class*='_hoverTitle']`）：官方这些类名是 CSS-module 哈希、仓库规矩禁止直写，
 *  后缀是稳定的那一半。四级映射维持官方原来的**层次关系**（标题最亮 → 路径 / 时间次之 → 状态最暗）。 */
export const HOVER_CARD_TEXT_TOKENS: readonly { suffix: string; token: string }[] = Object.freeze([
  Object.freeze({ suffix: '_hoverTitle', token: '--dsw-alias-label-primary' }),
  Object.freeze({ suffix: '_hoverPath', token: '--dsw-alias-label-secondary' }),
  Object.freeze({ suffix: '_hoverTime', token: '--dsw-alias-label-secondary' }),
  Object.freeze({ suffix: '_hoverStatus', token: '--dsw-alias-label-tertiary' }),
])

/** **顶光收束位置的变量名**：值由 `tones.ts` 的 `TOP_STOP` 发出、**两轴同值**（两轴严格镜像）。
 *  仍走 CSS 变量而非写死：与其余几何常量同一处事实来源，且背景层 CSS 能 `var(…, fallback)` 兜底。 */
export const TOP_STOP_VARIABLE = '--dsh-theme-tone-top-stop'

/** **模态弹窗**不再由本插件处理（2026-10-27：浮层整族不再叠我们的光层，只吃 token 颜色；见 surface.ts）。
 *  保留本注释是因为 05-surfaces 的「弹窗是内容面、不做玻璃」结论仍然成立 —— 那是官方的材质选择，不归我们。 */

