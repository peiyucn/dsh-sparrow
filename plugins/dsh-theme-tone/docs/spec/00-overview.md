# 00 · 架构总览 — dsh-theme-tone

> 2026-10-27 重写。旧 spec（00–13）已全部删除。本文是唯一事实来源；「已知偏离/已知问题」按最终决定记录，
> 不再保留过程中的临时方案。

## 功能清单

1. **颜色**：通过官方 `ctx.theme.overrideTokens` 覆盖 alias token（`{light, dark}` 成对），给整个界面重新着色。
2. **地面光**：插件自有的 `position: fixed` 装饰层（`.dsh-theme-tone`），三道光（顶 / 底 / 左），位置与方向
   按色调固定；**不使用 `mix-blend-mode`**（normal 合成，颜色与 screen 的差 ≤1/255）。
   官方座位（`[data-composer-seat]`）底部铺满 `bg-base` 会盖掉底光 ⇒ 在座位上按视口对齐
   （`background-attachment: fixed`）**重绘同一份地面光**，叠在官方 36px 渐隐之上：正文照旧淡出，
   页面底光重新露出来。这是「地面光」职责的一部分，放在 `backdrop.ts`。
3. **对话区顶栏玻璃**：顶栏浮层化（`position: absolute` + 滚动区 `padding-top: 76px` + 滚动条 track 下推
   + 拖拽条上沿 76px），玻璃放顶栏 `::before`（`z-index: -1`），并自绘同源三道光。
4. **输入框液态玻璃（Apple 风格，材质 + Fresnel 高光都在 `::before`）**：座位只让出底色
   （`background-color: transparent !important`，**不得用 `background` 简写**——否则会连
   `backdrop.ts` 在座位上重绘的底光与官方 36px 渐隐一起清掉）；卡片让出官方底色，材质放
   `[data-composer-card]::before`（`z-index:-1`，在文字之下）：半透明中性 tint +
   `blur(12px) saturate(160%)`；位移图就绪后换成 `blur(2px) saturate(180%) brightness(1.06)
   contrast(1.04) url(#dsh-theme-tone-lens)`，按圆角矩形的 bezel 逐像素折射（朝卡内取样，四边
   各自向外放大）。Fresnel 高光全部用同一层的 inset 阴影（左上亮、右下暗）；
   **不得占用 `::after`**——官方 `.cardWorkspaceTrigger::after` 用它画「未选工作区」的虚线框，
   我方选择器特异性更高，覆盖后会抹掉官方状态。位移图由 `src/client/lens.ts` 按卡片实际宽高 /
   圆角生成（canvas → PNG → `feImage`），尺寸变化防抖 90ms 后重建；不支持
   `backdrop-filter: url()` 时静默退回纯 blur。卡片形状 / 布局不改。
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

## 玻璃参数（统一）

| 参数 | 值 | 说明 |
| :--- | :--- | :--- |
| 模糊 | `GLASS_BLUR = blur(20px) saturate(150%)` | 顶栏 + 右栏两处玻璃共用同一个常量；2026-10-27 从官方 `blur(40px)` 调低（原值观感过糊） |
| 填充不透明度 | `GLASS_FILL_ALPHA = 0.45` | **两处玻璃共用同一个常量**，越小白越通透；填充色取官方 `bg-base` |
| 输入框玻璃 | `COMPOSER_FILL_ALPHA = 0.30` / `COMPOSER_BLUR = blur(12px) saturate(160%)` / `COMPOSER_OPTICS = blur(2px) saturate(180%) brightness(1.06) contrast(1.04)` / `LENS_BEZEL_PX` / `LENS_DEPTH_PX` | 中性 tint（透明度更高）+ 磨砂回退；位移图就绪后换成小 blur 光学层 + 透镜；Fresnel 高光用 `::before` 的 inset 阴影（不得占 `::after`） |
## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/tones.ts` | 调色板数据 + `tokenOverrides()`（唯一的颜色事实来源） |
| `src/backdrop.ts` | 地面光层 CSS、**座位底光重绘**、渲染计划、设置行色卡预览、CSS 特性门、层序不变式 |
| `src/glass.ts` | 顶栏 / 右栏玻璃 + 打光 + 右栏提拉；输入框液态玻璃的 CSS（材质 / specular / 透镜引用） |
| `src/client/lens.ts` | 输入框 bezel 透镜：找卡片、量几何、生成位移图、挂滤镜 SVG、dispose |
| `src/client/lens-map.ts` | 位移图纯函数（圆角矩形 SDF + bezel 内法线位移），Node 单测直接跑 |
| `src/nav-pin.ts` | 轮次导航恒显 + 内容宽度钳制（纯 CSS，布局功能） |
| `src/constants.ts` | 选择器锚点 / z-index / 标记属性 / 设置命名空间 |
| `src/compat.ts` | 能力门（缺失即惰性停用，不抛错） |
| `src/host.ts` + `src/settings-schema.ts` | host half：配置 schema、关掉自动配置页 |
| `src/client/index.ts` | 注入样式与地面层、写 token、设置行、写入与结算 |
| `src/client/{ThemeToneRow,styles,store,pending,known-settings,locales}` | 设置行 UI 与持久化辅助 |

**没有**：MutationObserver / 锚点扫描 / 相位变量。client 只在「安装、设置变化、主题变化、用户点选」时跑；
输入框透镜的一次性 rAF 轮询 + `ResizeObserver` + 几何读取收敛在 `lens.ts`，`dispose` 时全部释放；
尺寸变化防抖 90ms 后再重建位移图，避免换行时反复重新栅格化闪烁。

## 硬约束（守卫里钉住）

1. 除「官方默认档下也生效」的修牌面规则外，所有样式规则带 `body:not([data-dsh-theme-tone-plain])` 门。
2. `background-attachment: fixed` **只允许座位底光重绘**（fixed 定位区 = 视口、与地面层逐像素同源，面积仅 composer seat）；模糊只能取 `GLASS_BLUR` / `COMPOSER_BLUR` / `COMPOSER_OPTICS` 三个常量（透镜的 2px 必须小于无透镜回退的 12px）。
3. `backdrop-filter` 只出现在 `::before` / 独立玻璃层上，不挂在 header / 卡片 / pane 本体。
4. 不改官方容器的 `position` / `overflow` / `transform` / `contain`（右栏 pane 的 `position: relative;
   z-index: 0` 是已知例外，见「已知偏离」）。
5. 颜色只走 `ctx.theme` token 通道；玻璃与地面光必须写 CSS（官方无对应 token）。
6. 官方菜单 / 弹窗 / 挂靠卡材质一律保持原样，插件不覆盖。
7. **输入框玻璃只做材质 / 透镜 / specular**：座位只改 `background-color`（不得用 `background` 简写，
   否则清掉座位底光重绘）、卡片透明、材质只在 `::before`；不改官方圆角 / 尺寸 / 布局，不往卡片里塞
   额外覆盖层；**不得占用 `::after`**（官方 `.cardWorkspaceTrigger::after` 画「未选工作区」虚线框）；
   透镜失败必须静默回退纯 blur。

## 已知偏离 / 已知问题

* **顶栏浮层化**是布局改动（官方注释写明顶栏在流内），这是顶栏玻璃的前提；静止几何保持 76px 不变量。
* **右栏提拉**（正文上提 76px + 内容下移 + 负底距）是对官方滚动盒的视觉位置改写；官方改渲染器结构 /
  data 属性时 lift 会静默不命中，退回「带是半透明实心板」的降级观感。pane 补
  `position: relative; z-index: 0` 作 `::before` 包含块（不改变尺寸）。
* **输入框液态玻璃**：`backdrop-filter: url(#…)` 依赖 Chromium 的 SVG 滤镜路径；引擎不支持或位移图未就绪时
  自动退回纯 blur。卡片尺寸变化会触发位移图重建（防抖 90ms），极端情况下可能看到一次边缘折射跳变；
  官方若给卡片加 transform / 改变圆角实现，透镜形状需要同步（否则边缘畸变错位）。Fresnel 高光全部
  用 `::before` 的 inset 阴影，不另占 `::after`；官方 `.cardWorkspaceTrigger` 的无工作区虚线框因此不受影响。

## 验证

* `npm run verify`：typecheck → build → test → package。
* 单测覆盖：顶栏 / 右栏两处玻璃共用同一填充常量与官方模糊 token、输入框材质 / specular / 透镜引用、
  透镜滤镜契约与位移图纯函数、右栏提拉与头行玻璃、地面光层三道光与层序、token 计划与官方默认档、
  nav-pin 纯 CSS、悬浮卡锚点、client/index.ts 无逐帧探测。
* 真机验收（无头 + owner 复看）：顶栏 / 右栏 `backdrop-filter` 计算值、顶栏 y=76 不变量、
  输入框透镜（边缘折射、四角连续、换行不闪）、输入框下方 36px 渐隐与地面光、
  未选工作区的虚线框、底部地面光、右栏 76px 让位与提拉、设置弹窗打光。
