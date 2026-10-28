# 00 · 架构总览 — dsh-theme-tone

> 2026-10-27 重写。旧 spec（00–13）已全部删除。本文是唯一事实来源；「已知偏离/已知问题」按最终决定记录，
> 不再保留过程中的临时方案。

## 功能清单

1. **颜色**：通过官方 `ctx.theme.overrideTokens` 覆盖 alias token（`{light, dark}` 成对），给整个界面重新着色。
2. **地面光**：插件自有的 `position: fixed` 装饰层（`.dsh-theme-tone`），三道光（顶 / 底 / 左），位置与方向
   按色调固定；**不使用 `mix-blend-mode`**（normal 合成，颜色与 screen 的差 ≤1/255）。
   官方座位（`[data-composer-seat]`）原本铺一块 `bg-base` 渐隐板，会在对话底部形成一大块实色背景；
   本插件直接把它清成 `background: transparent`，不重绘、不补光——页面底光从透明座位后自然透出。
3. **对话区顶栏玻璃**：顶栏浮层化（`position: absolute` + 滚动区 `padding-top: 76px` + 滚动条 track 下推
   + 拖拽条上沿 76px），玻璃放顶栏 `::before`（`z-index: -1`），并自绘同源三道光。
4. **输入框液态玻璃（纯 CSS）**：卡片让出官方底色，`::before` 承担材质：透明填充 + 背景模糊，
   固定光源下的非均匀边缘高光（左上主光、对侧弱回光）与外层软阴影（悬浮）。
   **不在整面加偏光 / 渐变**；**不引入动态 SVG / ResizeObserver / rAF / 位移图**：输入框会随内容变高，
   任何按尺寸重建滤镜的方案都会在换行时闪；本版只走 CSS。官方圆角与布局不改，
   也不占用官方 `.cardWorkspaceTrigger::after`。
5. **右栏顶栏玻璃（真模糊）**：官方把「两条 38px 带（0..76）」与「滚区（76..底）」排成上下相邻的两个
   盒子 ⇒ 带背后永远只有面板纯色。做法：可流式滚动的正文（markdown/text 文档预览、文件树）上提 76px、
   内容下移 76px（只改视觉位置），头部在流内占的高度用负底距还回去 ⇒ 正文真的从两条带下滚过；玻璃面挂在
   各标签自己的 38px **头行** `::before` 上、向上铺满 0..76（两盒重合，y=38 不出缝），头行 z=2、dockkit
   条 z=3；pane 本体只画底色 + 同源光，不挂 blur；不改 pane 定位。上提的 margin 必须 `!important`
   （官方 `::-webkit-scrollbar-track` 规则会以伪元素特异性把上提量顶回 78px）。
6. **右栏内容区同款打光**：pane 用视口对齐（`100vw 100vh` + `right/top`）的「底色 + 三道光」重画。
7. **设置弹窗打光**：官方弹窗根 `[data-shortcut-modal='settings']` 叠同源光，**按弹窗自身盒子缩放**
   （`background-size: 100% 100%`；弹窗居中、位置不固定，不能按视口相位画）。
8. **悬浮卡适配主题**：左边栏 Workspace 行 hover 卡（官方写死深底 + 白系字）。面换 `--dsw-alias-bg-layer-3`，
   字换官方 `--dsw-alias-label-*`（层次保持）。锚点 `body > [role='button'][aria-label]`，字色按官方类名
   后缀命中 —— 唯一私有 seam，登记在 `docs/private-seams.md`。
9. **轮次导航功能（自 dsh-nav-pin 并入）**：纯 CSS、无锚点扫描。官方把 `display: none` 写在
   `<nav aria-label="Turn navigation">` 上 ⇒ 用公开 aria-label 压过官方类名；≤700px 默认隐身、hover /
   键盘 focus 淡入（只做 opacity）。会话内容宽度钳制：官方公式 `clamp(680px, column×0.64, 920px)` 上加
   `min()` 夹到「每侧 ≥120px / 地板 640px」，滚动体与拖拽条共用，卡片宽度同步重算。布局功能，不带色调门。
10. **对话宽度拖拽条**：官方两条拖拽条 z-index 很低，被本插件抬到 81 的内容层盖掉 ⇒ 抬到 82；
    `[data-side]` 还挂在 Tooltip 的 placement 上，排除 `role=tooltip`。

## 玻璃参数（三处统一）

| 参数 | 值 | 说明 |
| :--- | :--- | :--- |
| 模糊 | `GLASS_BLUR = blur(24px) saturate(170%) brightness(1.04)` | 顶栏 / 右栏 / 输入框三处共用；模拟 Liquid Glass regular variant 的冷调提亮 |
| 顶栏 / 右栏填充 | `GLASS_FILL_ALPHA = 0.4` | 两处共用；填充色取官方 `bg-base`；不新增边框 |
| 输入框 | 透明填充 + `COMPOSER_BLUR` | 低饱和模糊（saturate 110%），避免把主题底色放大成明显蓝调；固定光源的非均匀边缘高光 + 外层悬浮阴影；不在整面加偏光；不使用动态滤镜 |

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/tones.ts` | 调色板数据 + `tokenOverrides()`（唯一的颜色事实来源） |
| `src/backdrop.ts` | 地面光层 CSS、渲染计划、设置行色卡预览、CSS 特性门、层序不变式 |
| `src/glass.ts` | 顶栏 / 右栏 / 输入框三处液态玻璃 + 右栏提拉（唯一一处 `backdrop-filter` 来源） |
| `src/surfaces.ts` | 官方写死牌面的浮层修复（Workspace hover 卡） |
| `src/nav-pin.ts` | 轮次导航恒显 + 内容宽度钳制（纯 CSS，布局功能） |
| `src/constants.ts` | 选择器锚点 / z-index / 标记属性 / 设置命名空间 |
| `src/compat.ts` | 能力门（缺失即惰性停用，不抛错） |
| `src/host.ts` + `src/settings-schema.ts` | host half：配置 schema、关掉自动配置页 |
| `src/client/index.ts` | 注入样式与地面层、写 token、设置行、写入与结算 |
| `src/client/{ThemeToneRow,styles,store,pending,known-settings,locales}` | 设置行 UI 与持久化辅助 |

**没有**：MutationObserver / ResizeObserver / rAF 循环 / `getComputedStyle` 探测 / 锚点扫描 / 相位变量 /
动态 SVG 位移滤镜。client half 只在「安装、设置变化、主题变化、用户点选」时跑一次，其余时间零 JS 活动。

## 硬约束（守卫里钉住）

1. 除「官方默认档下也生效」的修牌面规则外，所有样式规则带 `body:not([data-dsh-theme-tone-plain])` 门。
2. 模糊只能取 `GLASS_BLUR` 一个常量，三处不得各写各的；顶栏 / 右栏不得新增边框或 inset 阴影。
3. `backdrop-filter` 只出现在 `::before` / 独立玻璃层上，不挂在 header / 卡片 / pane 本体。
4. 不改官方容器的 `position` / `overflow` / `transform` / `contain`（右栏 pane 的 `position: relative;
   z-index: 0` 是已知例外，见「已知偏离」）。
5. 颜色只走 `ctx.theme` token 通道；玻璃与地面光必须写 CSS（官方无对应 token）。
6. 官方菜单 / 弹窗 / 挂靠卡材质一律保持原样，插件不覆盖。
7. **输入框只用纯 CSS**：不引入动态 SVG / ResizeObserver / rAF / 按尺寸生成的位移图；卡片透明，
   材质只在 `::before`，不占用 `::after`（官方 `.cardWorkspaceTrigger` 的无工作区虚线框）。
   边缘光必须保持方向性，不能做成四条等亮的边。顶栏 / 右栏玻璃也不得新增边框或 inset 阴影。

## 已知偏离 / 已知问题

* **顶栏浮层化**是布局改动（官方注释写明顶栏在流内），这是顶栏玻璃的前提；静止几何保持 76px 不变量。
* **右栏提拉**（正文上提 76px + 内容下移 + 负底距）是对官方滚动盒的视觉位置改写；官方改渲染器结构 /
  data 属性时 lift 会静默不命中，退回「带是半透明实心板」的降级观感。pane 补
  `position: relative; z-index: 0` 作 `::before` 包含块（不改变尺寸）。
* **顶栏 / 右栏玻璃是 CSS 近似**：半透明填充 + 模糊 + 亮度调整，不新增边框 / inset 阴影，不引入
  SVG 位移图或 WebGL 逐像素折射。
* **输入框边缘是 CSS 光近似，不是真正逐像素折射**：背景模糊 + 固定光源下的边缘高光 + 悬浮阴影。
  曾在整面铺方向渐变，会读成“偏光”，已移除。曾尝试动态 SVG 位移透镜，但输入框高度变化时重建滤镜
  会闪，已整体移除；宁可降级也不能闪。
* **座位透明**：清掉官方实色底后，正文可能在输入框左右 / 下方透出；这是当前「不要黑块」的有意取舍。
  如果可读性受影响，需要另起方案（不能靠恢复整块实色底解决）。
* 悬浮卡修复是唯一私有 seam（见 `docs/private-seams.md`），官方改类名后缀即静默失效（回退官方配色，不崩）。

## 验证

* `npm run verify`：typecheck → build → test → package。
* 单测覆盖：顶栏 / 右栏共用同一填充与模糊、不新增边框 / inset、输入框透明 + 方向性边缘光 + 悬浮、
  不占用官方 `::after`、座位官方实色底被清除、右栏提拉与头行玻璃、地面光层三道光与层序、
  token 计划与官方默认档、nav-pin 纯 CSS、悬浮卡锚点、client half 无逐帧探测。
* 真机验收（无头 + owner 复看）：三处 `backdrop-filter` 计算值、顶栏 y=76 不变量、输入框变色 / 变高时
  不闪、方向性边缘光与悬浮、座位无黑块且底光透出、右栏 76px 让位与提拉、设置弹窗打光。
