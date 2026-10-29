# 00 · 架构总览 — dsh-theme-tone

> 2026-10-27 重写；2026-10-29 按「三处玻璃分开调参 + 官方浮层材料修正 + 底部补缝/滚动条修复」更新。
> 本文是唯一事实来源；「已知偏离 / 已知问题」按最终决定记录，不保留过程中的临时方案。

## 功能清单

1. **颜色**：通过官方 `ctx.theme.overrideTokens` 覆盖 alias token（`{light, dark}` 成对），给整个界面重新着色。
2. **地面光**：插件自有的 `position: fixed` 装饰层（`.dsh-theme-tone`），三道光（顶 / 底 / 左），位置与方向
   按色调固定；**不使用 `mix-blend-mode`**（normal 合成，颜色与 screen 的差 ≤1/255）。地面光低对比、面积大，
   8-bit 量化会出色带（水波纹）⇒ 再叠一层 **1 LSB 有序抖动**（2×2 棋盘 +1/255 白，正常观看不可见）。
   官方座位（`[data-composer-seat]`）原本铺一块 `bg-base` 渐隐板，会在对话底部形成一大块实色背景；
   本插件直接把它清成 `background: transparent`，不重绘、不补光——页面底光从透明座位后自然透出。
3. **对话区顶栏玻璃**：顶栏浮层化（`position: absolute` + 滚动区 `padding-top: 76px` + 滚动条 track 下推
   + 拖拽条上沿 76px），玻璃放顶栏 `::before`（`z-index: -1`）：54% 底色填充 + 冷调提亮模糊 + 85% 强度的
   页面金光。金光按**视口坐标**叠加（`background-attachment: fixed` + `100vw 100vh`），与左栏顶部取的是
   同一片光，只叠顶部 / 左侧两段（顶栏在视口顶部，底部那段用不到）；不新增边框 / inset 阴影。
4. **输入框磨砂玻璃（纯 CSS）**：卡片让出官方底色与阴影，材质只在 `::before`：
   暗色轴 = 「底色 60% + 抬升面 40%」混出的深色膜按 **62%** 浓度铺开 + 低饱和、略提亮的模糊；
   边缘光 = **贴边亮芯 1.5px + 5px 短软晕 + 定向 wash**（上下同款、左右同款，中段最亮、两端淡出），
   读作光打在玻璃边上而不是描边；悬浮阴影收小（主层 `0 16px 36px -24px`，避免在窗口底部压出暗带）。
   浅色轴单独覆盖：60% 乳白遮罩 + 更淡的边缘光与阴影。
   **不在整面加偏光 / 渐变**；**不引入动态 SVG / ResizeObserver / rAF / 位移图**：输入框会随内容变高，
   任何按尺寸重建滤镜的方案都会在换行时闪；本版只走 CSS。官方圆角与布局不改，
   也不占用官方 `.cardWorkspaceTrigger::after`。
   **输入框区漏字补缝**：座位整体透明（页面底光真实透出），座位里的空白区会漏出滚动的正文。
   在**两处**「本来就该是背景」的区域叠一层与地面层逐像素同源的「底色 + 打光 + 抖动」：
   ① 座位底部 48px 带（带顶落在输入框工具行背后，盖住卡片下沿圆角 / 统计胶囊行，又不遮住悬浮阴影）；
   ② 停靠卡（todo / goal / queue）的 `::after` 带（向上 20px 藏进卡面圆角、向下盖满 stack 缝 + 24px）。
   补缝层只盖「空白背景」，不改官方材质 / 几何，也不碰输入框卡片本身。
5. **右栏顶栏玻璃（真模糊）**：官方把「两条 38px 带（0..76）」与「滚区（76..底）」排成上下相邻的两个
   盒子 ⇒ 带背后永远只有面板纯色。做法：可流式滚动的正文（markdown / 纯文本文档预览、文件树）上提 76px、
   内容下移 76px（只改视觉位置），头部在流内占的高度用负底距还回去 ⇒ 正文真的从两条带下滚过；玻璃面挂在
   各标签自己的 38px **头行** `::before` 上、向上铺满 0..76（两盒重合，y=38 不出缝），头行 z=2、dockkit
   条 z=3；pane 本体只画底色 + 同源光，不挂 blur；不改 pane 定位。
   上提的 margin 必须 `!important`（官方 `::-webkit-scrollbar-track` 规则会以伪元素特异性把上提量顶回）；
   滚动条轨道起点 `76 + 2 = 78px` **只对 markdown 预览、纯文本预览（所有文件的兜底渲染器）与文件树**，
   其它预览沿用官方轨道起点。规则生成时伪元素必须逐条选择器追加（整串逗号列表末尾追加只命中最后一条）。
6. **右栏内容区同款打光**：pane 用视口对齐（`100vw 100vh` + `right/top`）的「底色 + 三道光」重画。
7. **设置弹窗打光**：官方弹窗根 `[data-shortcut-modal='settings']` 叠同源光，**按弹窗自身盒子缩放**
   （`background-size: 100% 100%`；弹窗居中、位置不固定，不能按视口相位画）。
8. **官方浮层材料修正**（`surfaces.ts`，**不带「官方默认」门**——这些是官方材料在深色玻璃 / 多卡叠放 /
   滚动场景下读起来不对，与色调偏好无关，任何音色下都修）：
   ① 左边栏 Workspace 行 hover 卡：官方写死深底 + 白系字 ⇒ 面换 `--dsw-alias-bg-layer-3`、字换官方
   `--dsw-alias-label-*`（层次保持）。锚点 `body > [role='button'][aria-label]`，字色按官方类名后缀命中
   ——私有 seam，登记在 `docs/private-seams.md`。
   ② 停靠卡（todo / goal / queue）材质：官方是半透明菜单玻璃，几张叠放时只有最上面一张看得出磨砂 ⇒
   统一换不透明抬升面（`bg-layer-1`，不做 blur），官方 elevation 阴影 / 边框 / 圆角保持不动。
   ③ 菜单分组标题（模型选择列表等）：官方 sticky 却没有背景，滚动时条目从标题下穿过 ⇒ 用
   「主题底色 + 菜单色」合成不透明底。
   ④ 输入框触发菜单（@ / 斜杠 候选列表）：官方用 `::after` 画一条 16px 的色块渐隐条当「下面还有内容」
   提示，在深色玻璃上会读成一条多余的长方形 ⇒ 隐藏该色块，改为**淡出列表内容本身**（`mask-image`，
   底部 / 顶部各 26px），由官方 `data-overflow-below` / `data-overflow-above` 属性驱动；滚到底时官方移除
   属性、渐隐自动消失，提示语义保留且更直观。
9. **轮次导航功能（自 dsh-nav-pin 并入）**：纯 CSS、无锚点扫描。官方把 `display: none` 写在
   `<nav aria-label="Turn navigation">` 上 ⇒ 用公开 aria-label 压过官方类名；≤700px 默认隐身、hover /
   键盘 focus 淡入（只做 opacity）。会话内容宽度钳制：官方公式 `clamp(680px, column×0.64, 920px)` 上加
   `min()` 夹到「每侧 ≥120px / 地板 640px」，滚动体与拖拽条共用，卡片宽度同步重算。布局功能，不带色调门。
10. **对话宽度拖拽条**：官方两条拖拽条 z-index 很低，被本插件抬到 81 的内容层盖掉 ⇒ 抬到 82；
    `[data-side]` 还挂在 Tooltip 的 placement 上，排除 `role=tooltip`。

## 玻璃与材质参数

| 位置 | 填充 / 浓度 | 模糊 | 光 |
| :--- | :--- | :--- | :--- |
| 对话顶栏 / 右栏头行 | `BAR_FILL_ALPHA = 0.54` × 官方 `bg-base` | `GLASS_BLUR = blur(24px) saturate(170%) brightness(1.04)` | `BAR_GOLD_PERCENT = 85%` 的页面金光，视口坐标（`fixed` + `100vw 100vh`），只叠顶 / 左两段 |
| 输入框（暗色轴） | 抬升面 `COMPOSER_LIFT_PERCENT = 40%` 混底色，按 `COMPOSER_VEIL_PERCENT = 62%` 铺开 | `COMPOSER_BLUR = blur(16px) saturate(105%) brightness(1.14)` | 8 层边缘光（亮芯 1.5px + 软晕 5px + 定向 wash，`COMPOSER_CORE_ALPHA = 0.08`）+ 收小的悬浮阴影 |
| 输入框（浅色轴） | `COMPOSER_VEIL_PERCENT_LIGHT = 60%` 乳白遮罩 | 同暗色轴（玻璃层 `backdrop-filter` 共用） | 更淡的边缘光（`COMPOSER_CORE_ALPHA_LIGHT = 0.05`）与阴影 |
| 输入框区补缝 | `bg-base` + 地面三光 + 1 LSB 抖动 | — | `SEAT_BAND_PX = 48` 座位底带；停靠卡 `::after` 带 = stack 缝 + 20px + 24px |

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/tones.ts` | 调色板数据 + `tokenOverrides()`（唯一的颜色事实来源） |
| `src/backdrop.ts` | 地面光层 CSS（含抖动层）、渲染计划、设置行色卡预览、CSS 特性门、层序不变式 |
| `src/glass.ts` | 顶栏 / 右栏 / 输入框三处玻璃 + 输入框区补缝 + 右栏提拉（`backdrop-filter` 的唯一来源） |
| `src/surfaces.ts` | 官方材料修正（hover 卡 / 停靠卡 / 菜单分组标题 / 触发菜单提示），不带色调门 |
| `src/nav-pin.ts` | 轮次导航恒显 + 内容宽度钳制（纯 CSS，布局功能） |
| `src/constants.ts` | 选择器锚点 / z-index / 标记属性 / 设置命名空间 |
| `src/compat.ts` | 能力门（缺失即惰性停用，不抛错） |
| `src/host.ts` + `src/settings-schema.ts` | host half：配置 schema、关掉自动配置页 |
| `src/client/index.ts` | 注入样式与地面层、写 token、设置行、写入与结算 |
| `src/client/{ThemeToneRow,styles,store,pending,known-settings,locales}` | 设置行 UI 与持久化辅助 |

**没有**：MutationObserver / ResizeObserver / rAF 循环 / `getComputedStyle` 探测 / 锚点扫描 / 相位变量 /
动态 SVG 位移滤镜。client half 只在「安装、设置变化、主题变化、用户点选」时跑一次，其余时间零 JS 活动。

## 硬约束（守卫里钉住）

1. `glass.ts` 里除「浅色轴输入框覆盖」（同时排除深色轴）外，所有样式规则带
   `body:not([data-dsh-theme-tone-plain])` 门；`surfaces.ts` 的官方材料修正**不带门**（任何音色都该修）。
2. 模糊只有两个常量：顶栏 / 右栏 `GLASS_BLUR`、输入框 `COMPOSER_BLUR`，不得各处各写各的。
   顶栏 / 右栏不得新增边框或 inset 阴影。
3. `background-attachment: fixed` 只允许两类用途：① 顶栏 / 右栏头行的金光（与地面层同视口相位、
   常驻装饰、只随视口重绘）；② 输入框区补缝层（座位底带 + 停靠卡 `::after`），它们是座位内静态、
   数量固定的层。不得扩散到逐消息 / 流式内容或其它常驻元素。
4. `backdrop-filter` 只出现在 `::before` / 独立玻璃层上，不挂在 header / 卡片 / pane 本体。
5. 不改官方容器的 `position` / `overflow` / `transform` / `contain`；例外只有三处，见「已知偏离」：
   右栏正文的 lift（margin / transform）、停靠卡根的 `position: relative; overflow: visible`
   （补缝层需要，见功能 4）。
6. 颜色只走 `ctx.theme` token 通道；玻璃与地面光必须写 CSS（官方无对应 token）。
7. 官方菜单 / 弹窗 / 挂靠卡材质保持原样 —— 例外只有功能 8 的四项官方材料修正（统一在 `surfaces.ts`）。
8. **输入框只用纯 CSS**：不引入动态 SVG / ResizeObserver / rAF / 按尺寸生成的位移图；卡片透明，
   材质只在 `::before`，不占用 `::after`（官方 `.cardWorkspaceTrigger` 的无工作区虚线框）。
   边缘光必须保持方向性，不能做成四条等亮的边。

## 已知偏离 / 已知问题

* **顶栏浮层化**是布局改动（官方注释写明顶栏在流内），这是顶栏玻璃的前提；静止几何保持 76px 不变量。
* **右栏提拉**（正文上提 76px + 内容下移 + 负底距）是对官方滚动盒的视觉位置改写；官方改渲染器结构 /
  data 属性时 lift 会静默不命中，退回「带是半透明实心板」的降级观感。滚动条轨道 78px 只在三条
  「正文确实 lift 了」的滚区上生效；其它预览沿用官方起点。
* **顶栏 / 右栏玻璃是 CSS 近似**：半透明填充 + 模糊 + 亮度调整 + 与地面层同相位的金光，不新增边框 /
  inset 阴影，不引入 SVG 位移图或 WebGL 逐像素折射。金光强度（85%）与填充浓度（54%）是逐档试出来的。
* **输入框边缘是 CSS 光近似，不是真正逐像素折射**：背景模糊 + 贴边亮芯 / 短软晕 + 悬浮阴影。
  曾在整面铺方向渐变，会读成「偏光」，已移除。曾尝试动态 SVG 位移透镜，但输入框高度变化时重建滤镜
  会闪，已整体移除；宁可降级也不能闪。
* **座位透明 + 局部补缝**：清掉官方实色底后，正文会从「卡片下沿 / 统计胶囊行 / 停靠卡缝隙与底角」
  等空白区漏出；这些区域用「地面原地重画」盖住（见功能 4），不再恢复整块实色底。缺陷面：补缝依赖
  官方锚点 `[data-testid='todo-panel']` / `[data-queue-dock]` / `[data-goal-bar]`，官方改锚点时静默
  不命中，降级表现 = 这几处回到「漏正文」（不崩、不影响布局）。
* **补缝层用 `background-attachment: fixed`**：两条、静态、滚动时视口位置不变（座位 sticky 在视口底部），
  这是当前纯 CSS 下让任意位置的补缝与地面层逐像素同源的办法。代价是滚动 / 流式输出时这两条随视口重新
  栅格化；若实测有卡顿，再换运行期相位（显式 `background-size/position` + 量出的视口相位）。
* **停靠卡材质被改成不透明**（与官方半透明菜单玻璃不同）：原因是多张卡叠放时只有最上一张看得出磨砂。
  官方若改卡面材质位置，`surfaces.ts` 的选择器会静默不命中，降级回官方半透明材质。
* **触发菜单提示改为内容渐隐**：依赖 `[data-trigger-menu]` + `data-overflow-below` / `-above` 属性 +
  `[role='listbox']`；官方改属性名会静默退回官方色块提示条（即那条「长方形」可能回来）。
* **菜单分组标题**不透明底依赖 `[data-menu-group-heading]`；官方改锚点则回到标题透明、条目穿过。
* 悬浮卡修复是唯一私有 seam（见 `docs/private-seams.md`），官方改类名后缀即静默失效（回退官方配色，不崩）。

## 验证

* `npm run verify`：typecheck → build → test → package。
* 单测覆盖：顶栏 / 右栏共用同一份材质（54% 填充、`GLASS_BLUR`、85% 同相位金光）、输入框暗色膜的
  抬升面 / 遮罩比例与 8 层边缘光、阴影收小、浅色轴覆盖、两条补缝带（48px 座位带 + 停靠卡 `::after`）
  与 fixed 用途计数、右栏 lift 与三类滚区轨道起点、设置弹窗打光、规则门禁与两个模糊常量、地面层抖动层、
  `surfaces.ts` 四项官方材料修正、client half 无逐帧探测。
* 真机验收（无头 + owner 复看）：三处 `backdrop-filter` 计算值、顶栏 y=76 不变量、输入框变色 / 变高时
  不闪、边缘光对称且中段亮、顶栏金光与左栏同色、窗口底部无长方条、停靠卡叠放一致、右栏滚动条从顶栏
  下沿开始、@ / 斜杠 菜单滚到底时提示消失、浅色轴无发灰 / 发脏。
  **未在真机复算**：纯文本渲染器分支的滚动条 track 计算值（与 markdown 由同一条选择器生成，仅结构验证）。
