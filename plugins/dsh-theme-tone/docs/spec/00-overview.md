# 00 · 架构总览 — dsh-theme-tone

> 2026-10-27 重写。旧 spec（00–13）已全部删除。本文是唯一事实来源；「已知偏离/已知问题」按最终决定记录，
> 不再保留过程中的临时方案。

## 功能清单

1. **颜色**：通过官方 `ctx.theme.overrideTokens` 覆盖 alias token（`{light, dark}` 成对），给整个界面重新着色。
2. **地面光**：插件自有的 `position: fixed` 装饰层（`.dsh-theme-tone`），三道光（顶 / 底 / 左），位置与方向
   按色调固定；**不使用 `mix-blend-mode`**（normal 合成，颜色与 screen 的差 ≤1/255）。
3. **对话区顶栏玻璃**：顶栏浮层化（`position: absolute` + 滚动区 `padding-top: 76px` + 滚动条 track 下推
   + 拖拽条上沿 76px），玻璃放顶栏 `::before`（`z-index: -1`），并自绘同源三道光。
4. **输入框玻璃**：座位撤掉官方 36px 实色渐隐（正文从卡片玻璃下滚过），卡片本体透明、玻璃与有方向边缘光
   放卡片 `::before`；卡片 `position: relative; z-index: 0` 自成层叠上下文（否则 `::before` 的
   `z-index:-1` 会逃出卡片 = 淡色框）；座位底部一小段「地面同源」带挡住卡片下方滚出的正文；卡片作用域内
   `--dsw-specific-selector: transparent`（「+」按钮让出实心底色）。
   **四缘光**：都不画均匀线；四边都在中点最亮、向两端衰减。上 / 下缘是主光、落差更大（0.12 + 0.04 基线，横向 45%）；左缘 0.08、右缘 0.06（背光），纵向 42%。
   **边缘折射（Apple Liquid Glass 式 bezel 透镜）**：按卡片**实际尺寸与圆角**用 canvas 逐像素
   生成位移图（圆角矩形 SDF；bezel 24px 内位移最大 24px、按 `(1-t)^2` 归零），写进 `<feImage>`，
   `feDisplacementMap scale="-255"` 把 128±dx 编码还原成像素位移；因为卡外常是实色地面带 / 空白，
   四边统一 `inward` **向卡内取样**（视觉一致「拉长」，中心不动），靠负 scale 反向消费。隐藏 SVG 的
   width/height 必须跟随卡片尺寸（feImage 的 100% 按 SVG 视口解析；留 0×0 会退化成黑图）。
   尺寸 / 圆角变化由 ResizeObserver 重建。
   CSS 用 `backdrop-filter: … url(#dsh-theme-tone-lens)` 引用；滤镜未注入
   （`body` 无 `data-dsh-theme-tone-lens`）或浏览器不支持时，保留纯 blur 声明回退。
   卡片带**悬浮投影**（朝下的柔和阴影，深 / 浅两套；不位移、不加 transform —— 位移会破坏与地面光、
   补缝层的像素对齐）。
   **停靠卡补缝**：停靠卡之间 / 与输入框之间的 stack 缝、以及卡片上下圆角后面都会透出正文，
   用「底色 + 打光」重绘盖住（`background-attachment: fixed`，与地面层逐像素同源；只在有停靠卡时生效）。
   每张卡顶部用 `::before`（上方 stack 缝 + 20px 藏进卡下，补顶部两个圆角处的侧边透字）、
   底部用 `::after`（下方 stack 缝 + 24px；queue / goal 另向上 20px 补底部圆角）。
   **不改官方几何**；卡根放开 `overflow: visible`（否则补缝层被官方裁剪吃掉）。
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
| 模糊 | `GLASS_BLUR = blur(2px) saturate(150%)`（临时压低以观察边缘折射，确认后回调） | 三处玻璃共用同一个常量；2026-10-27 从官方 `blur(40px)` 调低（原值观感过糊），测试钉住「三处同一值」 |
| 填充不透明度 | `GLASS_FILL_ALPHA = 0.6` | **三处统一同一个常量**，越小白越通透；填充色各自取官方面 token（顶栏/右栏 = `bg-base`，输入框 = `--dsw-specific-input-major`） |
| 边缘光 | `RIM_DARK` / `RIM_LIGHT` | 四边各留极淡基线（右缘另叠一点暗边），连成一圈；深/浅两套 |
| 四缘光 | `TOP_GLOW_*` / `BOTTOM_GLOW_*` / `LEFT_GLOW_*` / `RIGHT_GLOW_*` | 4px 径向柔光；上/下 0.12 + 0.04 基线（45% 横向），左 0.08 / 右 0.06 + 0.04 基线（42% 纵向） |
| 透镜斜面 | `LENS_BEZEL_PX = 24` / `LENS_DEPTH_PX = 24` / `LENS_MAP_SCALE = -255` | bezel 内边缘位移最大、按平方归零；负 scale + inward = 四边向卡内取样（视觉拉长），隐藏 SVG 视口 = 卡片尺寸 |

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/tones.ts` | 调色板数据 + `tokenOverrides()`（唯一的颜色事实来源） |
| `src/backdrop.ts` | 地面光层 CSS、渲染计划、设置行色卡预览、CSS 特性门、层序不变式 |
| `src/glass.ts` | 三处玻璃 + 打光 + 右栏提拉（唯一一处 `backdrop-filter` 来源） |
| `src/surfaces.ts` | 官方写死牌面的浮层修复（Workspace hover 卡） |
| `src/nav-pin.ts` | 轮次导航恒显 + 内容宽度钳制（纯 CSS，布局功能） |
| `src/constants.ts` | 选择器锚点 / z-index / 标记属性 / 设置命名空间 |
| `src/compat.ts` | 能力门（缺失即惰性停用，不抛错） |
| `src/host.ts` + `src/settings-schema.ts` | host half：配置 schema、关掉自动配置页 |
| `src/client/index.ts` | 注入样式与地面层、写 token、设置行、写入与结算 |
| `src/client/{ThemeToneRow,styles,store,pending,known-settings,locales}` | 设置行 UI 与持久化辅助 |

**没有**：MutationObserver / 常驻 rAF 循环 / `getComputedStyle` 探测 / 锚点扫描 / 相位变量。
唯一例外是输入框 bezel 透镜的位移图：安装后一次性 rAF 轮询找卡（≤120 帧），找到后用一个
ResizeObserver 在卡片尺寸 / 圆角变化时重建位移图，卸载时 disconnect；其余时间只被动等尺寸变化。

## 硬约束（守卫里钉住）

1. 除「官方默认档下也生效」的修牌面规则外，所有样式规则带 `body:not([data-dsh-theme-tone-plain])` 门。
2. 不得出现 `background-attachment: fixed`（**唯一例外**：停靠卡补缝层「底色 + 打光」重绘，见功能 4；
   固定背景定位区 = 视口）；模糊只能取 `GLASS_BLUR` 一个常量，三处玻璃不得各写各的。
3. `backdrop-filter` 只出现在 `::before` / 独立玻璃层上，不挂在 header / 卡片 / pane 本体。
4. 不改官方容器的 `position` / `overflow` / `transform` / `contain`（右栏 pane 的 `position: relative;
   z-index: 0` 是已知例外，见「已知偏离」）。
5. 颜色只走 `ctx.theme` token 通道；玻璃与地面光必须写 CSS（官方无对应 token）。
6. 官方菜单 / 弹窗 / 挂靠卡材质一律保持原样，插件不覆盖。

## 已知偏离 / 已知问题

* **边缘折射是 Chromium 的 `backdrop-filter: url(#svg)`**：不支持 SVG 滤镜的引擎会忽略增强声明、
  退回纯 blur；滤镜多一层 GPU 位移采样，位移图还按卡片尺寸在 canvas 上逐像素生成（仅安装后与
  尺寸变化时各一次），属于输入框玻璃的额外开销（只在 Composer 上启用）。`ResizeObserver`
  只观察输入框卡片本身，不观察整页 DOM。
* **顶栏浮层化**是布局改动（官方注释写明顶栏在流内），这是顶栏玻璃的前提；静止几何保持 76px 不变量。
* **右栏提拉**（正文上提 76px + 内容下移 + 负底距）是对官方滚动盒的视觉位置改写；官方改渲染器结构 /
  data 属性时 lift 会静默不命中，退回「带是半透明实心板」的降级观感。pane 补
  `position: relative; z-index: 0` 作 `::before` 包含块（不改变尺寸）。
* **输入框残影（Chromium ~150 回归，不修）**：VS Code 内置浏览器（1.143.1 = Electron 43.7.7 /
  Chromium 150 webview）在「菜单打开 + 流式输出」的极端场景会偶发把菜单碎片错位画进输入框；
  **正常 Edge（Chromium 156）无此问题**。时间线：VS Code 于 2026-10-23 更新到该版本，而输入框玻璃早已存在、
  此前从未出现残影 ⇒ 判定为 Chromium ~150 回归（Electron webview 的 backdrop-filter 合成路径问题），
  非本插件近期改动 / 用户设置；缩放假设已实测证伪（重置 100% 后更严重）。
  **owner 决定：不加环境门、不牺牲磨砂玻璃，接受该极端场景的偶发残影**，等 VS Code 升级内核自然消失。
  留档（未实施）：若将来需要，可在「Electron + Chromium ≤155」宿主里，菜单存在期间把输入框冻结为
  「去 blur + 实心 + 座位光墙」，菜单关闭恢复 —— 实测可消除残影。
* 悬浮卡修复是唯一私有 seam（见 `docs/private-seams.md`），官方改类名后缀即静默失效（回退官方配色，不崩）。
* 停靠卡缝隙补丁用 `[data-testid='todo-panel']` 识别 Todo 卡（官方无 data 语义锚点，只有 testid）；
  官方改 testid 时该补丁静默不命中，降级表现 = 缝隙回到无材质状态（不崩、不影响布局）。
* Todo 卡根用 `overflow: visible` 覆盖官方 `overflow: hidden`（官方用它裁材质）：只为了让补缝层画得
  出来，卡的圆角材质由自身 border-radius 维持，实测观感不变。
* 停靠卡缝隙那层用了 `background-attachment: fixed`：**只在「有停靠卡」时存在、面积仅 6px 高**，
  是当前唯一能在任意位置的元素上精确复刻「底色 + 打光」的办法。代价是滚动/流式输出时这一小条会随
  视口重新栅格化；若实测有卡顿，再换回「运行期测量相位 + 显式 background-position」（旧方案的成熟做法）。

## 验证

* `npm run verify`：typecheck → build → test → package。
* 单测覆盖：三处玻璃共用同一填充常量与官方模糊 token、方向边缘光、右栏提拉与头行玻璃、地面光层三道光与
  层序、token 计划与官方默认档、边缘折射滤镜与位移图几何、nav-pin 纯 CSS、悬浮卡锚点、client half 的 rAF 轮询有上限。
* 真机验收（无头 + owner 复看）：三处玻璃 `backdrop-filter` 计算值、顶栏 y=76 不变量、输入框底带与地面连续、
  右栏 76px 让位与提拉、设置弹窗打光。
