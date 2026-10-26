# 00 · 架构总览 — dsh-theme-tone

> 2026-10-27 重写。旧 spec（00–13，约 1.3 万行）已全部删除：它们记录的是被删掉的机制（相位测量、锚点扫描、
> 抬升面光层、扫光带、遮罩恢复……），继续保留只会误导。本文是新的唯一事实来源。

## 功能（当前清单）

1. **颜色**：通过官方 `ctx.theme.overrideTokens` 覆盖 alias token（`{light, dark}` 成对），给整个界面重新着色。
2. **地面光**：插件自有的 `position: fixed` 装饰层（`.dsh-theme-tone`），三道光（顶 / 底 / 左），
   位置与方向按色调固定。
3. **对话区顶栏玻璃**：顶栏浮层化（`position: absolute` + 滚动区 `padding-top: 76px` + 滚动条 track 下推
   + 拖拽条上沿裁到 76px），玻璃放在顶栏的 `::before`（`z-index: -1`），模糊复用官方
   `var(--dsw-menu-backdrop-filter)`，填充 = `bg-base` × 70% 半透明，并**自绘同源三道光**。
4. **输入框玻璃**：座位恢复透明（正文重新从卡片玻璃下滚过），底部一小段「地面同源」带挡住
   卡片下方滚出的正文；**模糊与半透明填充直接挂在卡片本体上**（不再用卡片 ::before 负层）+ 卡片
   `isolation: isolate` 自成 backdrop root；边缘光是**有方向**的（上亮/左弱亮/右暗/下暗，深浅两套）。
   改用卡片本体承载 blur 的原因：旧实现的「卡片负层 backdrop-filter」与官方菜单（body 层的
   backdrop-filter）重叠时，Chromium 会把菜单碎片快照画进卡片（owner 截图）；官方菜单已 createPortal
   到 body，不在卡片子树内，卡片作为 backdrop root 不会波及它们。**残影是否根治需 owner 真机复看**。

5. **右栏顶栏玻璃（真模糊）**：官方把「两条 38px 带（0..76）」与「滚区（76..底）」排成上下相邻的
   两个盒子 ⇒ 带背后永远只有面板纯色，直接加 blur 只能糊一块均匀色（读起来是实心板）。做法：
   * 把**可流式滚动的正文**（markdown / text 文档预览、文件树）上提 76px、内容下移 76px（只改视觉位置，
     滚动几何不变），头部在流内占的高度用负底距还回去 ⇒ 正文真的从两条带下滚过；
   * 玻璃面挂在各标签自己的 38px **头行** `::before` 上，向上铺满 0..76（两个面盒子重合，y=38 不出缝），
     头行抬 z=2、dockkit 条抬 z=3；blur 复用官方 token；
   * pane 本体只画底色 + 同源光，**不挂 blur**（会采样到自己的子内容）；不改 pane 定位。
   上提的 margin 必须 `!important`：官方的 `::-webkit-scrollbar-track` 规则会以伪元素特异性参与元素自身
   margin 竞争，把上提量顶回去。
6. **右栏内容区与对话区同款打光**（owner 2026-10-27 追加）：右栏 76px 以下的内容区不能是官方那块纯色
   `bg-base`，要与对话区一样看得见地面光 —— 用 `pane::after` 在内容区重画一层「`bg-base` + 三道光」：
   `background-size: 100vw 100vh`、`background-position: 100% -76px`（右栏贴视口右侧、内容区从视口 y=76
   开始 ⇒ 与对话区逐像素同源），层序 `-2`（在顶栏玻璃 `-1` 之下、内容之上）。**外观层，不改容器尺寸/定位。**
7. **设置弹窗打光**（owner 2026-10-27 追加）：官方设置弹窗根元素带公开属性
   `[data-shortcut-modal='settings']`；在它上面叠同源三道光，**按弹窗自身盒子缩放**（`background-size:
   100% 100%`；弹窗居中、位置不固定，不能按视口相位画）。
8. **悬浮卡适配主题**（owner 2026-10-27 追加）：左边栏 Workspace 行 hover 卡、对话轮次导航 hover 弹窗
   与官方大多数浮层不同 —— 官方把这两处的面与字都写死了（深底 + 白字，两轴同值），不跟随主题。
   修法：面用本插件 `--dsh-theme-tone-panel`（官方默认档下正是官方 layer3），字色换成官方
   `--dsw-alias-label-*` 四级 token（标题最亮 → 路径/时间次之 → 状态最暗），保持官方原来的层次关系。
8.5 **对话宽度拖拽条修复**：官方两条「调整对话宽度」拖拽条（`data-side` / `data-width-handle`）z-index
   很低，会被本插件抬到 81 的内容层整条盖住（表现为拖拽条消失、拖不动）。抬到 82；`[data-side]` 还挂在
   Tooltip 的 placement 上，必须排除 `role=tooltip`。
9. **轮次导航功能恢复**（owner 2026-10-27 追加，自 `dsh-nav-pin` 并入；要功能、不要旧实现）：
   纯 CSS，无运行期探测。官方把 `display: none` 直接写在 `<nav aria-label="Turn navigation">` 上 ⇒
   用公开 aria-label（中 / 英两套文案）即可压过官方类名特异性；≤700px 默认隐身、hover / 键盘 focus
   淡入（只做 opacity，不加框与底色）。会话内容宽度钳制：宽列每侧至少留 120px、窄列地板 640px
   （官方公式 `clamp(680px, column×0.64, 920px)` 上加 `min()` 夹紧），滚动体 / 拖拽条共用，
   卡片宽度同步重算。**布局功能，不带色调门（官方默认档同样生效）。**

「官方默认」档：整张玻璃表不命中、地面层隐藏、token 不覆盖 ⇒ 与没装插件一致。

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/tones.ts` | 调色板数据 + `tokenOverrides()`（颜色，唯一的颜色事实来源） |
| `src/backdrop.ts` | 地面光层 CSS、渲染计划、设置行色卡预览、CSS 特性门 |
| `src/glass.ts` | 玻璃与打光的 CSS（`backdrop-filter` 全部放在 `::before` 上） |
| `src/nav-pin.ts` | 轮次导航恒显 + 内容宽度钳制（纯 CSS，布局功能，不带色调门） |
| `src/constants.ts` | 选择器锚点 / z-index / 标记属性 / 设置命名空间 |
| `src/compat.ts` | 能力门（缺失即惰性停用，不抛错） |
| `src/host.ts` + `src/settings-schema.ts` | host half：配置 schema、关掉自动配置页 |
| `src/client/index.ts` | 注入样式与地面层、写 token、设置行、写入与结算 |
| `src/client/{ThemeToneRow,styles,store,pending,known-settings,locales}` | 设置行 UI 与持久化辅助 |

**没有**：MutationObserver / ResizeObserver / rAF 循环 / `getComputedStyle` 探测 / 锚点扫描 / 相位变量 / 私有类名。
client half 只在「安装、设置变化、主题变化、用户点选」时跑一次，其余时间零 JS 活动。

## 硬约束（守卫里钉住）

1. 所有玻璃规则带 `body:not([data-dsh-theme-tone-plain])` 门。
2. 不得出现 `background-attachment: fixed`，不得手写 `blur()` 数值（统一 `var(--dsw-menu-backdrop-filter)`）。
3. `backdrop-filter` 只允许出现在 `::before` 上（不挂 header / 卡片 / 面板本体，避免 backdrop root
   与 fixed 包含块影响官方弹层）。
4. 不改官方容器的 `position` / `overflow` / `transform` / `contain`（pane 补 `position: relative;`
   `z-index: 0` 作 `::before` 的包含块是已知例外；**不得**改用 `isolation` —— 它会让 pane 成为
   backdrop root，顶栏玻璃就采样不到背后的对话区）。
5. 颜色只走 `ctx.theme` token 通道；玻璃与地面光必须写 CSS（官方无对应 token）。
6. 官方默认牌面（菜单 / 弹窗 / 挂靠卡）材质由官方自己负责，插件不重画、不覆盖。
   例外：官方**写死**面与字的悬浮卡（左边栏 Workspace hover 卡，见功能 8）是修官方牌面，
   规则**不带**「官方默认」门。

## 已知偏离（明示取舍，不当成「和官方一致」）

* 顶栏浮层化是**布局改动**（官方注释写明顶栏在流内）。这是顶栏玻璃的前提；静止几何保持 76px 不变量。
* 输入框常驻 blur：官方自己只在菜单 / 浮层这类短生命周期表面用 blur（长期面全部不透明）。本插件按 owner
  要求保留常驻玻璃。性能**不以本插件的自动化基准对外断言**：owner 2026-10-27 明示「以我的体感为准」，
  代码侧只保证「没有逐帧 JS、没有 fixed 重栅格化路径、没有运行期测量」这些结构性成本为零。
* 右栏 `[data-dockkit-pane]` 加了 `position: relative; z-index: 0`（原本 static）作为 `::before` 的
  包含块；不改其尺寸。
* 设置弹窗：打光按弹窗自身盒子缩放（弹窗居中、位置不固定，不能按视口相位画）。
* 官方 rc.3 的挂靠卡（Queue/Todo/Goal）本身是半透明 + blur；插件不碰它们（token 染色会顺带跟随）。
* **覆盖官方菜单材质一处**：`[data-menu-material] { backdrop-filter: none !important }` —— 只关菜单的
  实时模糊、保留半透明填充。理由：残影只在菜单打开时出现，官方菜单 blur 与本插件玻璃层在合成器里
  重叠，是 Chromium 复用错位快照的触发条件（已列为残影的最后一个结构性假设）。
* 悬浮卡（功能 8）是唯一私有 seam：`body > [role="button"][aria-label]` 定位 portal 卡、
  字色按官方 CSS-module 类名后缀命中（`_hoverTitle` 等）。官方改后缀即静默失效（回退成官方写死配色，
  不会崩）；已登记 `docs/private-seams.md`。
* 右栏「正文上提 76px」是对官方滚动盒的**视觉位置改写**（margin + transform，不改 DOM 结构）：
  官方若改渲染器结构 / data 属性，lift 会静默不命中，退回「带是半透明实心板」的降级观感。
* 输入框残影（2026-10-27 现状）：**不用「菜单打开就撤 blur」的降级**（owner 明确否定：模糊不能消失），
  也**不再**用「座位光墙 + 静态 backdrop」（owner 实测：bug 没消失且功能被砍，已回退）。当前假设是
  「两个 backdrop-filter 层重叠（卡片的负层 + body 层菜单）」触发的 Chromium 合成快照错位 ⇒ 改为
  卡片本体承载 blur（去掉负层，改由卡片 isolation 自成 backdrop root）。**属结构性尝试，真机是否
  仍闪未验证**；若仍闪，剩余选项只有：① 关掉官方菜单材质的 blur（改官方材质）、② 接受偶发残影、
  ③ 放弃输入框 live blur。

## 验证

* `npm run verify`：typecheck → build → test → package。
* 单测覆盖：三块玻璃的 CSS 契约（含「无 fixed / 无手写 blur / 全部带门」）、地面光层三道光与层序、
  token 计划与官方默认档、client half 无逐帧探测。
* 真机验收（无头 + owner 复看）：三条玻璃面的 `backdrop-filter` 计算值、顶栏浮层化后 y=76 不变量、
  输入框下方遮罩与地面连续、右栏 76px 让位。
