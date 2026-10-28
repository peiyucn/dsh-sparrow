# 00 · 架构总览 — dsh-theme-tone

> 2026-10-27 重写。旧 spec（00–13）已全部删除。本文是唯一事实来源；「已知偏离/已知问题」按最终决定记录，
> 不再保留过程中的临时方案。

## 功能清单

1. **颜色**：通过官方 `ctx.theme.overrideTokens` 覆盖 alias token（`{light, dark}` 成对），给整个界面重新着色。
2. **地面光**：插件自有的 `position: fixed` 装饰层（`.dsh-theme-tone`），三道光（顶 / 底 / 左），位置与方向
   按色调固定；**不使用 `mix-blend-mode`**（normal 合成，颜色与 screen 的差 ≤1/255）。
3. **对话区顶栏玻璃**：顶栏浮层化（`position: absolute` + 滚动区 `padding-top: 76px` + 滚动条 track 下推
   + 拖拽条上沿 76px），玻璃放顶栏 `::before`（`z-index: -1`），并自绘同源三道光。
4. **输入框玻璃 · 第 1+2 步（材质 + 边缘高光）**：座位撤掉官方 36px 实色渐隐（正文从玻璃下滚过）；
   卡片本体承担半透明底色（跟官方圆角 / 动态高度走），`::before` 做 `backdrop-filter`，并用
   **全周 1px inset 内描边 + 上下线性柔光**画 specular 高光（自动跟圆角、四角不断光）；
   卡片作用域内 `--dsw-specific-selector: transparent`，让官方「+」等 selector 型按钮不读成实心块；
   卡片下方统计胶囊行（`[data-composer-dock]`）显式 `width:100%` + 卡片同款 max-width，
   自身重绘**底色 + 同源打光**（fixed 定位区 = 视口），向下盖住座位 4px 内边距，
   但不向上进入卡片（避免挡住玻璃下沿的模糊内容）。
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
| 填充不透明度 | `GLASS_FILL_ALPHA = 0.45` | **顶栏 / 右栏共用同一个常量**，填充色取官方 `bg-base` |
| 输入框材质 / 高光 | `COMPOSER_FILL_ALPHA = 0.55` / `COMPOSER_BLUR = blur(12px) saturate(140%)` / `COMPOSER_RIM_*` / `COMPOSER_SHEEN_*` / `COMPOSER_RADIUS_DELTA_PX = 2` | 第 1 步：半透明底 + 背景模糊；第 2 步：全周 1px 内描边 + 上下线性柔光；圆角 = 官方 panel 半径 − 2px（::before 继承） |

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/tones.ts` | 调色板数据 + `tokenOverrides()`（唯一的颜色事实来源） |
| `src/backdrop.ts` | 地面光层 CSS、渲染计划、设置行色卡预览、CSS 特性门、层序不变式 |
| `src/glass.ts` | 顶栏 / 右栏玻璃 + 打光 + 右栏提拉；输入框第 1+2 步（材质 + 边缘高光） |
| `src/surfaces.ts` | 官方写死牌面的浮层修复（Workspace hover 卡） |
| `src/nav-pin.ts` | 轮次导航恒显 + 内容宽度钳制（纯 CSS，布局功能） |
| `src/constants.ts` | 选择器锚点 / z-index / 标记属性 / 设置命名空间 |
| `src/compat.ts` | 能力门（缺失即惰性停用，不抛错） |
| `src/host.ts` + `src/settings-schema.ts` | host half：配置 schema、关掉自动配置页 |
| `src/client/index.ts` | 注入样式与地面层、写 token、设置行、写入与结算 |
| `src/client/{ThemeToneRow,styles,store,pending,known-settings,locales}` | 设置行 UI 与持久化辅助 |

**没有**：MutationObserver / ResizeObserver / rAF 循环 / `getComputedStyle` 探测 / 锚点扫描 / 相位变量。
client half 只在「安装、设置变化、主题变化、用户点选」时跑一次，其余时间零 JS 活动。

## 硬约束（守卫里钉住）

1. 除「官方默认档下也生效」的修牌面规则外，所有样式规则带 `body:not([data-dsh-theme-tone-plain])` 门。
2. `background-attachment: fixed` **只允许统计胶囊行的地面光重绘**（fixed 定位区 = 视口、与地面层逐像素同源，面积仅胶囊一行）；模糊只能取 `GLASS_BLUR` / `COMPOSER_BLUR` 两个常量，不得各写各的。
3. `backdrop-filter` 只出现在 `::before` / 独立玻璃层上，不挂在 header / 卡片 / pane 本体。
4. 不改官方容器的 `position` / `overflow` / `transform` / `contain`（右栏 pane 的 `position: relative;
   z-index: 0` 是已知例外，见「已知偏离」）。
5. 颜色只走 `ctx.theme` token 通道；玻璃与地面光必须写 CSS（官方无对应 token）。
6. 官方菜单 / 弹窗 / 挂靠卡材质一律保持原样，插件不覆盖。
7. **输入框玻璃第 1+2 步只做材质与高光**：允许座位透明、卡片半透明底、::before 模糊、
   全周 inset 内描边 + 线性 sheen；**不得**出现径向渐变边缘光 / 折射 url() / 停靠卡补缝规则。

## 已知偏离 / 已知问题

* **顶栏浮层化**是布局改动（官方注释写明顶栏在流内），这是顶栏玻璃的前提；静止几何保持 76px 不变量。
* **右栏提拉**（正文上提 76px + 内容下移 + 负底距）是对官方滚动盒的视觉位置改写；官方改渲染器结构 /
  data 属性时 lift 会静默不命中，退回「带是半透明实心板」的降级观感。pane 补
  `position: relative; z-index: 0` 作 `::before` 包含块（不改变尺寸）。
* **输入框玻璃重做中**：旧实现（径向四缘光、边缘折射、停靠卡补缝）已全部删除；第 1 步
  恢复半透明材质与模糊，第 2 步加全周内描边 + 线性高光；折射留待第 3 步。
* 悬浮卡修复是唯一私有 seam（见 `docs/private-seams.md`），官方改类名后缀即静默失效（回退官方配色，不崩）。

## 验证

* `npm run verify`：typecheck → build → test → package。
  头行玻璃、输入框材质 / 高光守卫、地面光层三道光与层序、token 计划与官方默认档、nav-pin 纯 CSS、
  悬浮卡锚点、client half 无逐帧探测。
* 真机验收（无头 + owner 复看）：顶栏 / 右栏 `backdrop-filter` 计算值、顶栏 y=76 不变量、
  输入框第 1+2 步材质与高光（可读、变高不闪、四角连续）、右栏 76px 让位与提拉、设置弹窗打光。
