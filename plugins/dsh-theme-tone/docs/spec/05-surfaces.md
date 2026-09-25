# 05 · 抬升面（弹出来的框）继承色调 — dsh-theme-tone

> **范围**：界面里一切弹出来的框（下拉菜单、模态对话框、浮动提示条）都继承所选色调。
> 本文替代 `00-overview.md`「不做」里那条「不染菜单 / 弹窗」的范围决定（见第 8 节）。

## 1) 问题

前三份 spec 处理的都是**地面**：底色、左栏、光晕、颗粒。但用户真正频繁盯着的是**浮起来的东西** ——
下拉菜单、模态对话框、浮动提示条。它们的颜色由官方的中性灰阶给（暗轴 `rgb(53,54,56)` 那一档），
跟色调没有关系；换色调时地面变了、浮层没变，读起来像「两张皮」。

## 2) 落点：官方 token，而不是组件选择器

「弹出来的框」在官方源码里全都靠一组**共享 alias token** 取背景色 —— 查一遍就知道该覆盖谁：

| 官方 token | 谁在用 | 暗轴官方值 | 亮轴官方值 |
| :--- | :--- | :--- | :--- |
| `--dsw-alias-bg-layer-3` | 菜单族（`ui-primitives/Menu.module.css:18` 经 `--dsw-specific-menu`）、`PopupSelectView`、`ModelSelect`、`InputTrigger/MenuView`、`stat-dialog`、`JobListAction`、`ScheduleCatalogAction`、`SubagentHeaderLineage`、`ContextMeter` | `bluish-800` `rgb(53,54,56)` | `bluish-00` `#fff` |
| `--dsw-alias-bg-layer-2` | 模态对话框（`ui-primitives/Modal.module.css:33`）、`DirectoryBrowser`、`SettingsRoot` | `bluish-850` `rgb(44,44,46)` | `bluish-00` `#fff` |
| `--dsw-alias-bg-layer-1` | `OnboardingSurface`、`FeedbackDialog`、`Input`、`JsonTree`、各类抬升卡片 | `bluish-875` `rgb(35,35,36)` | `bluish-00` `#fff` |
| `--dsw-specific-menu` | 菜单专用别名，官方绑定在 `var(--dsw-alias-bg-layer-3)`（`design-platform.css:240/333`） | 同上 | 同上 |

**另有一族「浅灰内嵌面」走独立通道**（见 §4.0.2，比例与抬升面**不同**）：

| 官方 token | 谁在用 | 暗轴官方值 | 亮轴官方值 |
| :--- | :--- | :--- | :--- |
| `--dsw-alias-markdown-code-block` | 代码块、`ioCard`、`payload`、`instructionsCard`、Trajectory 各块（15+ 处） | `bluish-900` | `bluish-50` `#f9fafb` |
| `--dsw-alias-markdown-code-block-banner` | 代码块顶栏 | `bluish-850` | `bluish-50` `#f9fafb` |
| `--dsw-specific-tip` | **三张停靠卡**：`TodoPanel`、`GoalBar`、`QueueDock` | `bluish-800` | `bluish-60` `rgb(245,246,247)` |

**为什么走 token 而不是写 CSS 选择器**：这些组件用的都是官方 hashed 类名（`._8HJdBW_cube` 之类），
写选择器会直接违反「不碰 hashed 类名」这条红线；而 token 是官方**公开的 alias 层**，
`ctx.theme.overrideTokens` 就是给这件事准备的 seam。一处覆盖，所有浮层一起跟随。

`--dsw-specific-menu` 本可以靠 layer-3 的 `var()` 间接跟随，**仍然显式覆盖一份**：
官方哪天把菜单改指别处，菜单也还在色调里。

### 有意**不**染的几处

| token | 为什么不动 |
| :--- | :--- |
| `--dsw-alias-tooltip-bg` | 两轴都是**反色**（亮轴的工具提示是深灰 `rgb(44,44,46)`），染了就把「反色」这个语义拆了 |
| `--dsw-alias-toast-bg` / `--dsw-alias-button-contrast-fill` | 同上，轻提示走反色 |
| `--dsw-alias-bg-mask-1` | 模态遮罩是黑色半透明，不是面 |
| `--dsw-hovercard-bg` | 官方把它写成组件内字面量 `#2C2C2E`（`HoverCard.module.css:14`，注明 light/dark 同值），声明在使用它的元素上 —— 覆盖只能靠 hashed 类名，故放弃 |

## 3) 机制：本色一处定义、两处派生

浮层色不是新调的一批色值，而是**把该色调的「本色」按比例混进官方的中性 rung**：

```css
--dsw-alias-bg-layer-3: color-mix(in srgb, rgb(96, 78, 168) 14%, var(--dsw-static-neutral-bluish-800));
```

* **本色**（`ToneSpec.tint`）就是 `bottom` 用的那个颜色，在色调表里只定义一处：
  `tint: '96, 78, 168'`，派生两条 —— `bottom = rgba(tint, DEPTH_ALPHA[轴])`、
  浮层 `= color-mix(tint P%, 官方 rung)`。
  **深色轴 `bottom` 的字符串逐字符不变**（`DEPTH_ALPHA.dark = 0.18`），有测试钉住同源关系。
* **锚在官方 static 变量**（`--dsw-static-neutral-bluish-800`）而不是硬编码 `rgb(53,54,56)`：
  官方换调色板时自动跟随。**必须引用 static 而不是 alias** —— 我们要覆盖的正是 alias，
  引用它会形成自引用环。
* **「官方默认」直通**：`tint === ''` 时输出 `var(--dsw-static-neutral-bluish-800)`，
  逐字符等于官方自己的绑定 → 「官方默认」仍然与停用插件逐像素一致。
* **整族收敛成一档**（`SURFACE_RUNGS`）：暗轴 `875`、浅轴 `00`，`layer-1/2/3 + 菜单` 同色。
  官方的三档只差 4–6/255、肉眼分不出，同屏并存就是「不统一」—— 见 §8.1。
  （`tip` **不在**这一族：它已归浅灰内嵌面通道，见 §4.0.2 —— 它要「比地面重」而本族要「与地面同深」。）
* **「默认」这一轴走另一张表**（`OFFICIAL_RUNGS`）：官方默认必须逐条回到官方绑定，
  **不能**发我们选的档（否则 `layer-3` 会从 `800` 被改深，破「官方默认完全不动」）。

## 4) 两轴的比例（抬升面与交互态同为 14%）

同一套机制，两个轴的地形不同，但**最终取值相同**（各 14%）：

* **暗轴**：rung 本身是足够亮的中性灰（`rgb(53,54,56)`，三通道和 163），离近黑底（和 36）很远，
  本色可以给得多 —— 14% 就能让菜单读起来是「紫黑 / 酒红 / 墨绿」而不是灰。
* **浅轴**：余量小得多（rung 在 245–255 之间，往浅色里混本色只会**变暗**），
  所以浅轴的深度**不由比例给**，而由**锚点**给 —— 见下。

### 4.0) 浅轴的锚点与面板比例

浅轴的分层靠**锚点档位**而非比例：

| 面 | 锚点 | 比例 |
| :--- | :--- | :--- |
| 抬升面（菜单 / 对话框 / 卡片） | **纯官方引用** | `PANEL_TINT.light = 0`（见 §4.0.1） |
| 交互态面 / 滚动条 | 官方 `bluish-60` 一类 | `SURFACE_TINT.light = .14` |
| 浅灰内嵌面（代码块 / 停靠卡） | 官方各自的档 | `INSET_TINT.light = .12`（见 §4.0.2） |

**为什么浅轴不能靠「加比例」求存在感**：从底色到纯白只有个位数余量，
本色越饱和能加的比例越小。比例一大，色相还没出来、明度先塌 —— 就是「军大衣」。

官方浅色轴的浮层与底色**本来就是同值**（都是白），抬升感靠阴影与描边、不靠填充 ——
所以浅轴的「浮层更亮」本来就不是官方的关系，本插件也不该照抄。

> **浅轴的色调存在感由锚点深度 + 浮层表面的光/纵深/颗粒承载**，不靠加大比例。

#### 4.0.1) 面板比例与交互态比例**分开**（`PANEL_TINT` / `SURFACE_TINT`）

浅色轴是**官方底色 + 主色打光**（地面是官方 `#fff`）。地面既已无色，面板**不得**再带本色 ——
否则就是「地面无色、浮层有色」两张皮。所以面板比例与交互态比例分开：

| 面 | 当前取值 |
| :--- | :--- |
| 地面 | `#fff`（官方，本插件不动） |
| **面板填充**（菜单 / 对话框 / 卡片） | **纯官方引用**（`PANEL_TINT.light = 0`） |
| 交互态面 / 滚动条 | `.14`（仍走 `SURFACE_TINT`） |

**为什么不一起降**：两者的**并列对象**不同 ——

* 面板要与**无色的地面**同屏并列 ⇒ 太艳就成「地面无色、浮层有色」两张皮，故面板比例取 `0`；
* 交互态面 / 滚动条**永远出现在已染色的面板之内**，不与地面直接并列 ⇒ 保持 `.14`。

##### 浅色轴面板比例为什么是 `0`（而不是 `.07`）

`.07` 的实测值是 `#f9fdfa`（green），而官方「面」色是
`--dsw-static-neutral-bluish-50` = **`#f9fafb`**（代码块、左侧栏都用它）—— **两者只差 1–3 阶**。
后果是**任何用官方面色当背景的元素都不再可辨**。落点：Trajectory 视图的画布取
`--dsw-alias-bg-layer-1`（`dsh-client-ui-trajectory` 的 `qBU-ya_root` / `Y0dWHa_split` / `Y0dWHa_table`），
官方面是 `#fff`、代码块 `#f9fafb`（差 6 阶，灰底读得出来）；被染成 `#f9fdfa` 后与代码块同色 →
**代码块的底色被吃掉**。

浅色口径是「**官方底色配置 + 打光用主色**」：既然打光已经给了色调，再往**面**上染色就是重复叠色，
且必然改动官方底色。面板比例取 `0`，浅色轴的抬升面与官方**逐字符相同**，分层改由描边与阴影承担
（与官方浅轴同法）。`rungFill` 对比例 `0` 直接短路成官方引用，不产出 `color-mix(… 0%, …)` 那种恒等包装。

深色轴**不动**（两者仍同为 `.14`）：它的地面是本色染过的近黑、本就与面板同源，没有这个冲突。

`PANEL_TINT` 只由 `surfaceFill()` 消费（面板填充）；`SURFACE_TINT` 仍由 `STATE_TOKENS` /
`SCROLLBAR_TOKENS` 消费。两者在浅色轴是**两个不同的档**（`0` / `.14`），有测试钉住（`surfaces.test.mjs`）。

#### 4.0.2) 浅灰内嵌面：**第三条通道**（`INSET_TOKENS` / `INSET_TINT`）

官方浅色轴另有一族「**比背景略暗的浅灰面**」，用来在白色地面上圈出内容块：

| 官方 token | 谁在用 | 官方浅色 | 官方深色 |
| :--- | :--- | :--- | :--- |
| `--dsw-alias-markdown-code-block` | 代码块、`ioCard`、`payload`、`instructionsCard`、Trajectory 各块（15+ 处） | `bluish-50` `#f9fafb` | `bluish-900` |
| `--dsw-alias-markdown-code-block-banner` | 代码块顶栏 | `bluish-50` | `bluish-850` |
| `--dsw-specific-tip` | **三张停靠卡**：`TodoPanel` / `GoalBar` / `QueueDock` | `bluish-60` `#f5f6f7` | `bluish-800` |

**它与抬升面的目标相反，所以必须分开**：

| 通道 | 语义位置 | 目标 | 比例 |
| :--- | :--- | :--- | :--- |
| 抬升面（`PANEL_TINT`） | 浮在地面**之上** | 要**浅**（别显脏） | 浅 `0` |
| **内嵌面（`INSET_TINT`）** | 嵌在地面**之内** | 要**比地面重**才读得出 | 浅 `.12` |

官方浅色轴这几族本就是「**比背景略暗的浅灰面**」—— 代码块与三张停靠卡都靠这层浅灰在白底上圈出内容块。
用本色替这层浅灰，面就比背景重，边界正好读得出来：

实测印证必要性：官方这两档与白背景分别只差 **5.1 / 9.1** 阶；而浅色轴抬升面是纯白，
`--dsw-specific-tip` 等于 `#fff` —— **与背景同色**，三张停靠卡的面直接消失（只剩 4% 描边在撑）。
染色后（本色 12% 混进官方灰）：

| 色调 | 代码块 | 比背景 | 停靠卡 | 比背景 |
| :--- | :--- | :--- | :--- | :--- |
| 苔青 | `#f0f7f3` | −9.8 | `#edf4f0` | −12.8 |
| 霜蓝 | `#edf6f9` | −10.7 | `#e9f2f6` | −14.6 |
| 樱花 | `#f9f4f7` | −9.7 | `#f5f0f3` | −13.7 |

即「比官方灰更重、但远不到彩色块」。**「默认」轴走每条自带的 `official` 字段**（逐条回官方绑定，不含 `color-mix`）。

**代码块比停靠卡浅 2–3 阶是刻意的**：两族官方基数本来就不同（代码块 `bluish-50` `#f9fafb`、
停靠卡 `bluish-60` `#f5f6f7`），我们**沿用各自基数**，只是按同一比例混本色 ——
所以官方「代码块更白、提示卡更深」的既有层级关系被保留，没有被我们抹平。
（实测：苔青下代码块 `rgb(240,247,243)` L=245.2、停靠卡 `rgb(237,244,240)` L=241.9。）

**`INSET_TINT.light` 取 `.12`**：代码块比白背景 −9.8、停靠卡 −12.8，仍远高于官方的 −5.1 / −9.1
（读得出边界），但不像灰板；`.18` 偏重、`.10` 偏淡。
若要再调，一次挪一格（`.10` / `.14`），下界参考官方的 −5.1。

#### ⛔ 停靠卡的选择器规则**不得**再写 `background-color`

三张停靠卡（`COMPOSER_CARD_ANCHORS`）既走 token 通道拿底色，又有一条选择器规则补图层。
那条规则**不得**写 `background-color: var(<面板变量>) !important`：同一块面有两个颜色来源时，
`!important` 会盖掉 token 层的染色 —— 它是根据浅色轴的纯白面板变量算的，一压上去三张卡的面就
**盖成纯白**，token 层的染色完全失效。

**正解：底色归 token 层**（本节这条通道），选择器规则**只写 `background-image`**（它拿不到的颗粒 + 光）。
有守卫钉住（`test/surfaces.test.mjs`：三条锚点的规则块里**不得出现 `background-color`**）。

教训与「实色遮盖」同源：**同一块面只能有一个颜色来源**。两处都写、且其中一处是 `!important` 覆盖时，
任何一边调整（这里是面板比例 `0` 与 token 层染色的关系）都会让另一边静默失效。

### 4.1) 不变量（token 层，测试逐条钉住，`test/surfaces.test.mjs`）

| 不变量 | 为什么 |
| :--- | :--- |
| 深色轴 `bottom === rgba(tint, DEPTH_ALPHA.dark)` | 本色在深色轴比底亮，可以兼做辉光 |
| 浅色轴 `bottom === rgba(本色, DEPTH_ALPHA.light)` | 三层光全部来自本色（浅色用**主色**打光） |
| 两轴 `bottom` 那一层都**比底色亮** | 辉光的语义是「加亮」，有测试钉住 |
| `DEPTH_ALPHA` 深 `.18` / 浅 `.30` | 浅色 `.30` = 三层光的纵深档（与卡面对齐见 03-palette）；深色 `.18` 与本色在深底上的辉光量相称 |
| 每个 rung 引用 `--dsw-static-*`，不引用 `--dsw-alias-*` | 防自引用环 |
| 整族（layer-1/2/3 + 菜单）**同色** | 官方那三档只差 4–6/255，同屏并存即「不统一」 |
| 浮层填充**不得**走 layer-* 那档浅灰、也不得是 color-mix | layer 族是行内面的档位；浮层走它就会再次变成「比地面亮的灰板」 |
| 浅色轴**面板**比例恒为 `0`（抬升面逐字符等于官方） | 浅色口径是「官方底色 + 主色打光」；`.07` 实测 `#f9fdfa` 会压住官方面色 `#f9fafb` |
| 浅灰内嵌面与抬升面**比例必须不同** | 两者目标相反：抬升面要浅、内嵌面要比地面重（§4.0.2） |
| 浅灰内嵌面「官方默认」直通官方绑定、不含 `color-mix` | 同「完全不介入」底线 |
| 暗轴阶梯单调（layer1 < layer2 < layer3） | 中性 rung 的次序不能被染色打乱 |
| 暗轴三款在每个 rung 上仍可分辨 | 本色没被中性 rung 冲平 |
| 不染工具提示 / 轻提示 / 遮罩 | 反色与遮罩语义不能被染 |
| 「官方默认」输出官方变量引用、不含 `color-mix` | 逐像素一致这条验收标准 |

> **浮层与地面同深之后怎么分层**：靠阴影（官方 `--dsw-elevation-prominent`）、官方那圈 elevation 描边，
> 以及浮层自己那三层光/纵深/颗粒。这与官方**浅轴**的做法同源（官方浅轴浮层与底色都是白，全靠阴影），
> 真机若觉得「看不出是个弹窗」，把 `SURFACE_RUNGS` 抬一档即可（§9）。

## 5) 影响面

覆盖 layer-1/2/3 意味着**不止「弹出来的框」**：官方把这一族 token 同时用在很多**行内抬升面**上
（设置页卡片、表格行、JsonTree 头、`PresentRow`、`Trajectory*` 等）。它们会跟着带上一点色调。

这是**有意**的：这族 token 就是「抬升面」这一个语义，拆开覆盖会让同一个界面里
（设置页里卡片与菜单同屏）出现一半带色、一半不带的斑驳。代价是改动面比字面需求大 ——
若真机上认为行内卡片不该跟着变，**去掉 `SURFACE_TOKENS` 里的 `--dsw-alias-bg-layer-1` 一行**即可，
菜单族（layer-2/3 / specific-menu）不受影响。

**浮层的填充与图层不会波及行内面**：那两条走的是 `SURFACE_ANCHORS` 选择器（只命中浮层元素），
不是「改一档 token 全体跟随」。`--dsw-alias-bg-layer-1/2/3` 的消费者（输入框 / JsonTree 头 / 设置卡片 / 表格行）
仍是第 2 节那套 token 染色，档位与官方一致。这是刻意选的实现方式：同一个视觉目标，
改 token 的爆炸半径是整棵树，改选择器的半径正好是「弹出来的框」。

> **浮层是面板语义**：一档比地面深、彼此统一的面板色（`SURFACE_RUNGS`），分层靠描边、阴影与 hover 洗染。
> **不是**「浮层填充 = 对话区底色」—— 那样浮层与地面同色、读不出抬升。

### 5.1 描边是**爆炸半径最大**的一族

`--dsw-alias-border-l1/l2/l3/l4` 是全树共用的发丝线：官方源码里仅 `client` 包内就有 **70+ 处**消费
（设置卡片 / 面板外框 / 工具栏分隔 / 输入框描边 / 表格列线 / 各种 `--dsw-elevation-stroke-color` 绑定）。
染它们意味着**界面上几乎每一条线**都会带上一点色调。

这是**有意**的，不是失手：

* **「内部元素」必须整族一起染**：只染菜单里的那条分隔线、而设置卡片的外框仍是中性，
  就成了新的不统一 —— 那正是本插件要消灭的问题；
* 只有 **4–20% 的低 alpha**，染完仍是「一条线」，不会变成彩色描边；
* 官方的**四档强弱关系一字不动**（`l1 < l2 < l2-darkmode-thin ≤ l3 < l4`），所以层级语义保留；
* 官方默认下**整族让路**（`OFFICIAL_RUNGS` 那条路），选了「默认」就是原样。

**真机上若认为线太花**：把 `BORDER_TOKENS` 砍到只剩 `l1`（菜单外框与分隔线就是它）即可，
其余四档立刻回到官方中性 —— 一行可回退。

**滚动条同理**但范围小得多：`--dsw-alias-scrollbar-*` 只被「给 `--dsh-scrollbar-thumb` 赋值」的地方用，
而那正是**抬升面**（每个滚动容器的 `scrollbar.css` 契约），所以它天然落在「浮层内部」这个范围内。

## 6) 表面绘制：浮层要的是「和整屏同一种材质」

> 浮层口径：**弹出框不要透明效果，但色调、质感、颗粒、金色渐变得有**。

第 3 节的 token 染色只解决了**色相**；浮层仍是**一块平的纯色**，和整屏那种「近黑底 + 顶部金光 + 底部本色辉光 + 星尘」
不是一个材质。所以还要把**背景层那套配方**按浮层尺度再画一遍 —— 这就是 `src/surface.ts`。

### 6.1 兜底通道：填充 + 三个图层

```css
/* 带门的五条锚点（[role='dialog'] 那条见下方注）*/
body:not([data-dsh-theme-tone-plain]) [role='menu'],
body:not([data-dsh-theme-tone-plain]) [data-trigger-menu],
body:not([data-dsh-theme-tone-plain]) :has(> [role='listbox']),
body:not([data-dsh-theme-tone-plain]) [role='listbox']:not([data-trigger-menu] *),
body:not([data-dsh-theme-tone-plain]) [role='dialog']:not(:has(> img)) {
  background-color: var(--dsh-theme-tone-panel) !important;
  background-image:
    var(--dsh-theme-tone-grain-tile, none),
    radial-gradient(ellipse 120% 42% at 50% -12%, var(--dsh-theme-tone-top, transparent), transparent 76%),
    radial-gradient(ellipse 110% 52% at 50% 112%, var(--dsh-theme-tone-bottom, transparent), transparent 76%) !important;
}

/* ⚠️ 悬停卡是**唯一不带门**的一条（见 §8.4）：官方把它的面与字写死成组件内字面量，
   「先把官方默认修了，然后再适配咱们的」，所以两个档都要修。
   底色带**官方 layer-3 兜底** —— 它是唯一「token 层未就绪时也照常生效」的规则，
   没有兜底而 var() 解析为空时，!important 会把卡片压成全透明（比不生效更糟）。 */
body > [role='button'] {
  background-color: var(--dsh-theme-tone-panel, var(--dsw-alias-bg-layer-3)) !important;
  background-image: … !important;
}
```

> 注意**门是并进锚点自身的 `body`** 的（不是 `body:not([…]) body …`）——
> 后者会拼出「body 套 body」永远不命中。见 §6.3.1。

**这一节是兜底，不是主责**：菜单族的主通道是 token（`POPUP_TOKENS`，见 §8.1）——
因为存在**没有 role** 的弹层，语义锚点覆盖率永远小于 100%。选择器只为两类东西保留：
自带硬编码底色的插件弹层、以及官方那些用 `layer-1/2` 但自己带类的对话框。

**填充取 `PANEL_VARIABLE`**（面板底色，与 token 层同一个值，见 §8.1）。浮层是**面板**语义：
比地面深、彼此完全一致；与页面的分离交给**阴影 + 官方那圈 elevation 描边 + 下面这三个图层**。
**浮层底色不走对话区底色** —— 那样浮层与地面同色、读不出抬升。

* **上下三层**：颗粒压在最上面（才像砂面）→ 顶部光层（共享光源）→ 底部本色辉光（该色调自己的纵深）。
* **浮层用色调表原值，不放大** —— 浮层是**实况**，不是色卡预览。
  （色卡为了「让 83px 的小卡读出区别」在深色轴放大，而**卡面与实况必须一致** —— 浅色轴把实况 α
  提到卡面等效值，见 `PREVIEW_ALPHA_SCALE` 与 03-palette。浮层这条**始终**是原值，不受色卡缩放影响。）
* **两个属性都 `!important`**：官方写的是 `background:` **简写**（内含 `background-image: none`），
  特异度又各写各的（`.list` / `.card` / `.portal .menu` …），无法穷举；压不过就是静默失效。
  反过来，因为只动这两样，万一锚点没命中，剩下的也只是一个官方面，不会出现「半截样式」。
* **不设 blend mode**：颗粒的强度烘在贴图里（`POPUP_GRAIN_DATA_URI` 的 `<rect opacity='0.13'>`）。
* **不用 `background:` 简写**：那会连带重置 `background-position` / `-repeat` 等，官方这些面里
  有靠它们的（如 `dockkit` 的浮层）。

### 6.2 色值怎么到浮层上：走 token 覆盖层

浮层是**官方元素**（portal 到 `body`），读不到背景层元素上的内联变量。所以插件把自己那三个光色变量
（`--dsh-theme-tone-top` / `-bottom` / `-grain-tile`）也**发到 token 层**（`LIGHT_TOKENS`，写在 `body` 的内联样式上）
—— 浮层是 `body` 的后代，天然继承得到。

顺带白拿三件事：明暗两轴一次给全、切轴时由官方 presenter 自动改写、卸载时随覆盖层一起回收。
**本模块因此一行业务代码都不用写**（不监听、不重绘），纯 CSS。

空串（色调表里「不画」的表示）在自定义属性里非法，`LIGHT_TOKENS.pick` 统一翻成 `transparent` / `none`。

### 6.3 落点：语义锚点（逐个查过官方源码 + 本仓库其余插件）

官方这些面的类名都是 hashed 的，**稳的只有语义属性**：

| 锚点 | 谁长这样 |
| :--- | :--- |
| `[role='menu']` | `Menu` 原语 `.list` / `.submenu`、`ModelSelect`、dockkit `TabMenu`、`dsh-codebuddy-credits` 的模型菜单 |
| `[data-trigger-menu]` | 输入框上方的 `@` / `/` 菜单卡片（官方自己也拿它当 `:has()` 锚点） |
| `:has(> [role='listbox'])` | 命令面板**卡片**（`PopupSelectView` 的背景长在祖先上、`role` 在内层视口上，只能反向够祖先） |
| `[role='listbox']:not([data-trigger-menu] *)` | **自带背景的 listbox 弹层** —— 本仓库插件 portal 出来的那些（`dsh-chat-fim` 的候选菜单与敏感度弹层） |
| `[role='dialog']:not(:has(> img))` | 各对话框：官方 Modal / 设置面板 / 上下文用量 / 轮次用量，以及 archive / file-manage / codebuddy 三家的对话框 |
| `body > [role='button']` | **悬停卡**（`HoverCard`）—— `createPortal` 直挂 `body` 的固定层 |
| ⛔ 图片灯箱 | 被 `:not(:has(> img))` **排除**：它的 `role='dialog'` 长在**整屏容器**上，染它 = 全屏糊一层金光 |

**排除条件**取 `> img`，**不得**用 `> [aria-hidden]`：`StatsPills` / `TurnUsagePanel` 的 `.panel` 里
也各有一个 `<div className={titleRule} aria-hidden>` 当直接子元素（画标题下那条细分隔线）
→ 会被一起排除，那两个弹层就始终是纯色。灯箱真正的唯一特征是那枚**整屏 `<img>`**。用 `> img` 实测：
六个真实对话框（Modal 默认 / Modal headless / 设置面板 / 上下文用量 / token 消耗 / 插件对话框）
**全部命中**，只有灯箱被排除。

**悬停卡为什么要单列一条**：它的底色是组件自己的字面量 `--dsw-hovercard-bg: #2C2C2E`
（`HoverCard.module.css:14`，官方注明 light/dark 同值），**声明在元素自身上** —— token 覆盖层发到
`body` 上会被它自己的声明盖过，所以只能靠选择器。锚点用 `body >`（**直接子元素**）收窄 ——
实测全页只有这一个；菜单项虽也有 `role='button'`，但都在浮层内部，不是 body 的孩子。
（`Toast` = `alert`、`OnboardingSurface` = `presentation`、`DropOverlay` = `status`，都天然被排除。）

> ⚠️ **但它不算通用锚点** —— 它**面和字都被官方写死**，走 §6.3.2 的独立规则：
> 面与字一起掰回主题，且**两个档都修**（全插件唯一不带官方默认门的一条）。

### 6.3.2 悬停卡：官方把**面和字都写死了** —— 全插件唯一一处刻意改官方默认

**悬停卡**（`HoverCard`，左边栏会话 hover 那张 244px 预览卡）的**面与字都由官方写死、两轴同值**：

| 写死的东西 | 出处 |
| :--- | :--- |
| 面 `#2C2C2E`（组件级字面量，注释 `light/dark identical`） | `HoverCard.module.css:13-21` |
| 字 `#FFFFFF` / `#CFD3D6` / `#ADB2B8`（注释 `dark surface, fixed colors both themes`） | `Rows.module.css:301-335` |

所以浅色轴下官方自己就是**一张深卡**。

**⚠️ 只改面、不改字，在这张卡上必错**：通用规则读**当前轴**的变量，浅色轴会把面染成近白，
而字仍是为深卡准备的浅字 → **白底白字**。反过来把它钉成「恒深面」也不对 ——
浅色轴下它就该是浅卡。

**修法** —— 面与字**一起**掰回主题，且**两个档都修**：

```css
/* 面：走我们的面板变量（官方默认档下它正是官方自己的 layer3） */
body > [role='button'] { background-color: var(--dsh-theme-tone-panel) !important; background-image: <颗粒 + 光> !important }

/* 字：把写死的浅字换成主题感知的官方 label token，四级层次照旧 */
body > [role='button'] [class*='_hoverTitle']  { color: var(--dsw-alias-label-primary)   !important }
body > [role='button'] [class*='_hoverPath']   { color: var(--dsw-alias-label-secondary) !important }
body > [role='button'] [class*='_hoverTime']   { color: var(--dsw-alias-label-secondary) !important }
body > [role='button'] [class*='_hoverStatus'] { color: var(--dsw-alias-label-tertiary)  !important }
```

**⚠️ 这是全插件唯一不带「官方默认」门的浮层规则** —— 其余八条锚点全部带门。
它修的是「官方把一张卡写死了」这个毛病，不是我们的色调偏好，所以不该等选了色调才生效。
**新增规则时别照着抄这条的门** —— 它是特例，不是新惯例。

**字色选择器为什么按后缀匹配**：官方类名是 CSS-module 哈希的（形如 `Sixlwa_hoverTitle`，
哈希每次构建都变），仓库规矩禁止写哈希类名；`_hoverTitle` 是稳定的那一半。
备选是「整卡统一继承一个正文色」（不碰哈希），但那会把四级层次压平 —— 取保留层次的做法。
常量表见 `constants.ts` 的 `HOVER_CARD_TEXT_TOKENS`，有守卫测试钉住「至少用两档不同 token」。


**「其余插件也跟着变」不用各插件适配**：查过 dsh-sparrow 全部活跃插件，它们的弹层**都用了 `role=`**
（archive / file-manage / codebuddy 用 `role='dialog'`，codebuddy 另有 `role='menu'`，chat-fim 用两个 `role='listbox'`），
所以上面这份清单已经把它们的浮层一并覆盖 —— 这正是不写组件选择器、只认语义属性的好处。

**已知的一处重叠**：命令面板（`PopupSelectView`）的卡片被 `:has(> [role='listbox'])` 画一次、
它内部的滚动视口又被 listbox 那条画一次 → 列表区是**两层渐变叠着**（顶部搜索框区是一层）。
排不掉：那个卡片除了 hashed 类名没有别的可判属性。alpha 低（金 `.09` / 本色 `.18`），叠起来仍在同色系内，
判为可接受；若真机上看着偏亮，**去掉 `[role='listbox']` 那条锚点**（代价是 chat-fim 的弹层失去质感）。

**覆盖范围**：工具提示（两轴反色）不覆盖；
`ui-jobs` 那个**没有 role** 的 `<ul>` 任务列表、子代理血缘弹层、轮次预览卡必须覆盖。
三者都必须显式收进来：一个没有 `role`、两个用的 `role` 与内联组件共用 ——

| 浮层 | 官方实际长什么样 | 锚点 |
| :--- | :--- | :--- |
| **后台任务列表**（`JobListAction`，头部任务数按钮弹出的 `<ul>`） | **没有 role**，只有 `aria-label`（本地化文案，不能当选择器） | `body [data-slot='conversation.session.header.actions'] ul` —— 改用**它所在的官方槽位**锚定 |
| **子代理血缘弹层**（`SubagentHeaderLineage`，头部 `1/3 ⌄`） | `role='tree'`，`createPortal` **直挂 body** | `body > [role='tree']` |
| **轮次预览卡**（`TurnNavigator` 右侧刻痕栏 hover / focus 弹出） | `role='tooltip'`，`position: absolute`，**不** portal（长在 `<nav>` 里） | `body [role='tooltip']:not([data-side])` |

⚠️ **不要写成 `body > [role='tooltip']`**：注释会诱导那么写，
「`Tooltip` / `TurnNavigator` 的预览，**均 portal 到 body**」—— **这句话是错的**，两个都不 portal：

| 组件 | 定位 | 是 `body` 直接子元素？ |
| :--- | :--- | :--- |
| `ui-primitives/Tooltip` | `position: fixed`，源码开头注释明写 escape … **without a portal** | ❌ |
| `TurnNavigator` 的预览 | `position: absolute`，长在 `<nav>` 里 | ❌ |

于是 `body >` 会把两个**一起漏掉**，那条规则**一条都命不中**（死规则）。
**收窄选择器之前必须先核实元素真实的挂载位置**，不得把推断写进注释当依据。

`role='tooltip'` 官方只有这两个生产者，用 `:not([data-side])` 区分：`Tooltip` 气泡**总有**
`data-side`（`right` / `bottom` / `top`，用于翻转 `transform`，`Tooltip.module.css:22-32`），
预览卡**没有**。排除气泡是**有意**的 —— 它的底色走 `--dsw-alias-tooltip-bg`，**两轴都是反色**
（浅色轴上它是深灰），那是它的语义（见 `tones.ts`「不染的几处（有意）」）；
糊上夜色面板 + 颗粒会把它读成一个小菜单。

**为什么 `role='tree'` 必须收窄成 `body >`**：官方**四处**在用这个 role —— 除了子代理那个浮层，
还有 `JsonTree`、`WorkspaceBrowser` 的会话树、`TrajectoryTable`，**全是内联组件**。
无条件写 `[role='tree']` 会把它们的背景换成不透明填充 + 光 + 颗粒（那就错了）。
只有子代理那个是从 body portal 出来的直接子元素。

**新增官方浮层时的核对判据**：① 有 role → 按 role 收进来（`menu` / `listbox` / `dialog` / `tree` / `tooltip`）；
② 没有 role → 找它**所在的官方槽位**（`data-slot`）或 portal 形态（`body > …`）；
③ 拿不准就**收窄**（`body >`、`> ul`），宁可漏一个也别误伤内联组件。

（悬停卡也在收进来的那批里，靠 `body > [role='button']`。）

### 6.3.1 三个会把自己悄悄打死的实现错误（各有回归守卫）

三类「CSS 看着对、其实不生效或误伤」的实现错误，症状分别是**对话框跟着页面滚动**、
**权限/模型下拉有颗粒而其他弹层是纯色**、「对话框下面那三个胶囊没改」。三条根因都在本插件，
静态读代码很难发现，故单列：

| 错误 | 症状 | 根因 | 守卫 |
| :--- | :--- | :--- | :--- |
| 官方默认门的**拼接方式** | 六条浮层锚点**全不命中** → 只有走 token 的组件还留着质感，其余弹层（含对话框）都是纯色 | 写成 `body:not([PLAIN]) ${anchor}`，而锚点**自带 `body ` 前缀** → 拼出 `body:not([…]) body [role='menu']`（**body 套 body**），**永远不可能命中** | 改用 `gatedAnchor()` 把门**并进**锚点自身的 `body`；测试断言全文不得出现 `body:not([…]) body`，且每条锚点门后只含一个 `body` |
| 玻璃规则给底座写了 `position` | 输入框**跟着内容滚走**（不再钉在底部） | glass 的底座选择器是 `body:not([…]) [data-phase='active'] [data-composer-seat]` = **(0,3,1)**，比官方 `.root[data-phase='active'] .composerSeat` 的 **(0,3,0)** **高** —— 那条「兜底 `position: relative`」（注释自以为不生效）实际**压掉了官方的 `position: sticky`** | 底座本体**不得**写 `position`（官方 sticky 本身就是定位元素，`::before` 的包含块已成立）；测试断言底座本体不得出现 `position:` |
| 灯箱排除条件**过宽** | 「token 消耗」两个弹层（`StatsPills` / `TurnUsagePanel`）**始终是纯色** | 排除用的是 `:not(:has(> [aria-hidden='true']))`（针对灯箱的遮罩），但这两个弹层的 `.panel` 里也有 `<div className={titleRule} aria-hidden>` 当直接子元素 → **被一起排除** | 改用灯箱真正的唯一特征 `:not(:has(> img))`；实测六个真实对话框全命中、只有灯箱被排除；测试断言不得用 `aria-hidden` 当判据 |

教训写在这里：**这两条都不会让任何测试变红** —— 一条是「选择器永不匹配」，一条是「特异性比官方高」，
两者在静态读代码时都很像是对的。两条都有回归守卫钉着。

### 6.4 几何：常量和整屏/色卡放在一起

`POPUP_TOP_SHAPE` / `POPUP_BOTTOM_SHAPE` / `POPUP_STOP` 与整屏的 `*_SHAPE`、色卡的 `PREVIEW_*` 并列，
遵守同一条「全插件的渐变几何只有一处事实来源」规则。

> **落点说明**：整屏与色卡的几何在 `src/backdrop.ts`；浮层这三个在 `src/constants.ts` ——
> 因为 `tones.ts` 也要读它们，而 `backdrop.ts` 反过来 import `tones.ts`，放那边会成环。
> 这是**一处有意为之的例外**（几何仍只有一处定义，只是不在同一个文件里）。

浮层尺度取中间档：比整屏铺得开（整屏形状在小面上全落在盒外），又比色卡收一档。
浮层顶光取 **42%**：不能收到整屏那档 —— 否则顶光在小面上变成一层色浆。

| | 竖直半径 | 可见范围（`-12% + H×76%`） |
| :--- | :--- | :--- |
| 整屏顶光 `DARK_RADIAL_SHAPE` | 45% | 约 **18%** 屏高 |
| 浮层顶光 | **42%** | 约 **20%** 面高 |

「军大衣」的根因就在这里：浅轴的页面光层 α 是 `.28`（为整屏存在感调的），同一份浓度铺在 30% 面高
这种大片面积上就从「一条顶光」变成了「一层奶茶色的色浆」，米色叠绿 = 卡其；顶光收到 20% 面高才是顶光。
**压的是面积，不是浓度** —— α 一个字没动（见 4.1）。底部染色也没动（本来就只有 27%，与整屏 31% 同量级）。

> 浅色轴的光层取**主色**（见 03-palette）—— 本色本来就是这个空间的主色，叠在浮层上不会引入外来色相。
> 本节的**几何结论不受影响**。

## 7) 交互态（选中 / hover / 按钮面）

> 交互态与浮层内部元素（选中 / hover / 按钮 / 下拉菜单）的颜色同样要适配，
> 不得留在官方中性值上 —— 指的就是下面这几族。

第 2 节染的是**面**（底 / 左栏 / 抬升面），第 6 节给浮层补了**质感**；但界面里还有一大类颜色没跟上：
**交互态**与**框内元素**。设置页最显眼的两个地方是左导航的选中块与 provider 编辑器那块面板；
浮层里最显眼的则是那条分隔线（§7.5）。

### 7.1 三族，两种混法

| 族 | token | 官方原值 | 混法 |
| :--- | :--- | :--- | :--- |
| **不透明中性态面** | `--dsw-specific-sidebar-nav-item-active` / `-hover` / `-active-accent`、`--dsw-alias-bg-module-platform`、`--dsw-alias-interactive-bg-hover-solid`、`--dsw-alias-button-elevated-fill` / `-floating-fill` / `-floating-hover` / `-ghost-active-fill` / `-ghost-active-hover` | `--dsw-static-neutral-bluish-*` 变量引用 | `color-mix(本色 P%, var(--dsw-static-…))` —— 与抬升面同一条 |
| **低 alpha 洗染** | `--dsw-alias-interactive-bg-hover` / `-active` / `-hover-accent`、**骨架条** `--dsw-alias-bg-skeleton`、**描边五档** `--dsw-alias-border-l1` / `-l2-darkmode-thin` / `-l2` / `-l3` / `-l4` | **字面量** `rgba(38, 49, 72, .06)`（浅）/ `rgba(255, 255, 255, .08)`（深） | **只换 RGB，alpha 一字不动**（见下） |
| **滚动条** | `--dsw-alias-scrollbar-bg-l1` / `-bg-l2` / `-hover-l1` / `-hover-l2` | `--dsw-static-neutral-*` 变量引用（**纯灰**，连 bluish 都不是） | `color-mix`，比例沿用抬升面的 `SURFACE_TINT` |

**为什么洗染不能直接 `color-mix`**：`color-mix` 在 sRGB 里是**按 alpha 预乘**插值的，alpha 也会被加权平均 ——
深轴 hover 是 8% 白，混 25% 本色后 alpha 变成 `.25×1 + .75×.08 = .31`，**一层 8% 的 hover 变成 31%**，
而且三档（8% / 14% / 24%）会被一起推到同一个量级，彼此分不出来。所以这几条在 JS 里算：
保持 alpha，只把 RGB 往本色挪（`washFill`）。发出去的仍是字面量，不是 `color-mix`。

**洗染比例比面高一档**（`WASH_TINT` 两轴同为 `.25`，面是 `.14` / 浅轴抬升面取 `0`）：低 alpha 上色相本来就难读，
不推远一点等于没染。

**滚动条为什么不能跟洗染一样保 alpha**：它引的是 `--dsw-static-neutral-*`（**实心不透明**的变量），
根本没有 alpha 可保 —— 直接走 `color-mix`。这几个是**浮层里最后一处纯中性**：官方绑的是 `neutral`
而不是 `bluish`，所以菜单内部一滚动，一条纯灰滑块会从染过的面板上横切过去。

**滚动条比例为什么用 `SURFACE_TINT` 而不是 `WASH_TINT`**：它是「面」的量级（一个实心块），
不是一层洗染。用 `WASH_TINT` 会让滑块比它所依附的面还要艳。

### 7.5 框内元素：描边与滚动条

第 6 节给了浮层**外观**（填充 + 颗粒 + 光），但**框里面**还剩两类纯中性：**分隔线 / 描边**与**滚动条**。

| 谁 | 在哪 | 官方原值 |
| :--- | :--- | :--- |
| `--dsw-elevation-stroke-color` → `--dsw-alias-border-l1` | 菜单卡的外描边（`Menu.module.css:19`）、codebuddy `.ccb-model-menu` 同款 | `rgba(255,255,255,.06)` 纯白洗染 |
| `--dsw-alias-border-l1` | 菜单 `.separator`（`Menu.module.css:223`） | 同上 |
| `--dsw-alias-border-l2` | `.footer` 顶线（`Menu.module.css:89`） | `rgba(255,255,255,.12)` |
| `--dsw-alias-border-l2-darkmode-thin` | 深色轴的「细一档」（`AttachmentRail` / `QuestionComposer` 的描边与高度描边色） | `rgba(255,255,255,.06)` |
| `--dsw-alias-scrollbar-bg-l2` / `-hover-l2` | 菜单内部滚动条（`Menu.module.css:26-27` 把 l2 绑给 `--dsh-scrollbar-thumb`） | `--dsw-static-neutral-600` / `-550` 纯灰 |
| `--dsw-alias-bg-skeleton` | `@` 菜单的加载骨架条（`MenuView.module.css:178`） | `rgba(255,255,255,.08)` 纯白洗染 |

**注意这几条本来就「跟着底色走一点」** —— 它们是半透明的，叠在已经被染过的面上。
但 alpha 只有 4–20%，叠出来的色相几乎读不出来，所以观感上「框外是紫的、框里还是灰的」。

**不染 `border-inverted` / `-inverted2`**：两轴都是 `rgba(0,0,0,0)`（零宽度占位），染了等于凭空画出一条线。

### 7.6 输入框里的图标按钮：**默认去底、保留 hover**

输入框左下那两个圆按钮（`+` 命令面板 / 附件）**要像下拉菜单一样：默认底不要、保留 hover 底**。

**根因**：官方给它们的默认底是 `background: var(--dsw-specific-selector)` —— 一个**不透明实色**
（真机 `#353638`）。而这两个按钮**坐在玻璃卡片里面**：卡片是半透明 + 模糊，按钮却是实色板
→ 读成两块**贴在玻璃上的塑料片**，与卡片不是同一种材质。去掉默认底后，按钮区域显示的就是
**卡片自己的玻璃**，材质统一了。

**做法：只覆盖一个 token，不重写规则。** 官方两个状态用**两个不同的 token**：

| 状态 | 官方选择器 | 底色来源 |
| :--- | :--- | :--- |
| 默认 | `.uV2eYG_add` | `var(--dsw-specific-selector)`（实色） |
| **hover** | `.uV2eYG_add:hover:not(:disabled)` | `var(--dsw-alias-interactive-bg-hover-solid)`（**另一个** token） |

所以把前者置为 `transparent` 即可，**hover 那条规则天然不受影响** —— 不必重写 hover、
也不必跟特异度较劲。

**⚠️ 覆盖范围收在卡片里（不写 `body`）**：`--dsw-specific-selector` 名字很通用，
覆盖前逐包 grep 过官方产物 —— **全树只有 `.uV2eYG_add` 一个消费方**
（定义在 `dsh-client-ui-theme`，两轴各一份 `--dsw-static-neutral-bluish-60` / `-800`）。
但语义上它仍是个通用 token，官方将来若给别的组件接上，写 `body` 会**误伤**；
收在 `body [data-composer-card]` 内则永远不会外溢。
**覆盖范围一律收在具体容器里，不得写到 `body` 上。**

**不在改动范围**：权限按钮（`Access mode`）**本来就是透明的**（真机 `rgba(0,0,0,0)`），
不需要处理；两个模型/权限类触发器同理。

**回归守卫**：`test/surfaces.test.mjs` 一条 —— 该 token 必须置 transparent、
**不许自己重写 hover**（那是官方的职责）、**不许写到 body 上**。

### 7.2 有意**不**染的（语义色）

| token | 为什么 |
| :--- | :--- |
| `--dsw-alias-interactive-bg-hover-danger` | 危险态是**红色语义**，跟色调走会让「删除」看起来像普通 hover |
| `--dsw-alias-button-primary-fill` / `-primary-hover` | 主按钮 = 品牌色 = 反色对比（浅轴近黑 / 深轴近白），染了就不再是「最重的那个」 |
| `--dsw-alias-state-success-*` / `-error-*` / `-warn-*` | 语义色在任何主题下都必须是它自己 |
| `--dsw-alias-bg-mask-*` | 遮罩是黑色半透明，不是面 |
| `--dsw-alias-border-inverted` / `-inverted2` | 两轴都是 `rgba(0, 0, 0, 0)`；染了等于凭空画出一条线 |

> 代码块 `--dsw-alias-markdown-code-block*` **不在此列**（要染）—— 它走 §4.0.2 的
> 内嵌面通道（`INSET_TOKENS`），与停靠卡同一族：和停靠卡一样是「白色主题下的浅灰面」，
> 染了才读得出边界。不属于「行内元素」的排除范围。

### 7.3 一处判断题：`--dsw-specific-sidebar-nav-item-active-accent`

它的浅轴绑定是 `--dsw-static-deepseek-100`（**品牌蓝**），深轴是 `--dsw-static-neutral-bluish-800`（中性）。
按「品牌色不动」的字面规则应该排除，但它的**角色**是「选中项的强调底」（`QuestionComposer.module.css:282` 的已选行），
不是品牌标识 —— 留一块深蓝在染过的面板里是最扎眼的破绽。**判为要染**，这是一处判断而非规则；
真机上若认为品牌蓝该保留，从 `STATE_TOKENS` 里删掉那一行即可。

### 7.4 相对关系（染完仍然成立）

染的是「同一档色阶」，所以官方的明暗关系原样保留（有测试守 `bottom === rgba(tint, DEPTH_ALPHA)` 那条同源关系，
这里是同一思路的手工核算）：

| 面 | 深轴（violet） | 浅轴（blue） |
| :--- | :--- | :--- |
| 对话框（layer-2） | `rgb(44,44,46)` → **51,49,63** | `#fff` → 248,252,253 |
| 模块面板（module-platform） | **59,57,72**（比对话框亮） | **239,243,244**（比对话框暗） |
| 导航选中（nav-item-active） | **71,70,87**（最亮） | **229,236,241**（最暗） |

深轴「越靠前越亮」、浅轴「越靠前越暗（选中越深）」—— 与官方同向，只是带上了色相。

## 8) 统一：一处颜色、一条通道、一道门

整族的颜色收敛到**一处定义、两条通道**，避免「官方三档 / 插件硬编码 / 没有 role 的弹层」三种来源并存。

### 8.1 颜色只有一处定义

| 项 | 值 |
| :--- | :--- |
| **整族收敛成一档**（`SURFACE_RUNGS`） | 暗轴 `875`、浅轴 `bluish-00`（纯官方白），`layer-1/2/3 + 菜单` 全部同色 |
| 分层靠什么 | **描边、阴影、hover 洗染** —— 不靠一堆肉眼难辨的灰阶（这也是官方浅轴自己的做法） |
| 暗轴为什么从官方 `800` 下压到 `875` | 染色后 188 → 139，治「弹出框偏浅」（压太深会成「军大衣」，见 §4） |

### 8.2 两条通道，各有代价

| 通道 | 给什么 | 覆盖谁 | 代价 |
| :--- | :--- | :--- | :--- |
| **token**（`POPUP_TOKENS`） | **只有颜色**（官方那款**半透明玻璃色**，只换 RGB、保 alpha），且**两个名字同值**（`--dsw-menu-surface-fill` 与别名 `--dsw-specific-menu`） | 全部消费方，**有无 `role` 都算** | 无 `role` 的弹层拿不到颗粒与光 |
| **选择器**（`surface.ts`） | **图形**（颗粒 + 顶 / 底光）+ 同源底色 | 带 `role` 的**真浮层** | 那一个无 `role` 的 `<ul>`（`ui-jobs/JobListAction.tsx:157`）只有颜色 |

**为什么配方不能进 token**：官方把同一个 `--dsw-specific-menu` 也用在 `ModelSelect` 的
`.groupTitle`（`ModelSelect.module.css:167-177`，`background` 在 `:172`）与 codebuddy 的
`.ccb-model-groupTitle` 上。
它们是 `position: sticky; top: 0` 的小条，必须与菜单主体**同色**；而百分比渐变是
**按元素自身盒子缩放**的 —— 同一条 `ellipse 120% 42% at 50% -12%` 落在一条 24px 高的横条上
会被重新压成一道带硬边的金色带，而菜单主体只在顶部 20%。**同一份值、两个高度、两种结果**，
这是百分比渐变的固有性质，调参数救不了。

**反向守卫**：`POPUP_TOKENS` 的值里**不许出现** `gradient` / `url(`。
无 `role` 下拉只拿到颜色、没有颗粒与光 —— 它没有任何可用的语义锚点，
用 hashed 类名去兜违反本插件红线，所以接受。

> **分组标题的定案（2026-09-25 第四轮；完整决策记录见
> [`docs/upstream/0.1.7/适配完成报告.md`](../../../docs/upstream/0.1.7/适配完成报告.md) 的「第十轮」）**：
> 上面这条约束的结论是"配方不能进 token"，
> **不是**"标题什么都不画"。标题由 `surface.ts` **单独一条规则**接管
> （锚点 `GROUPED_MENU_SELECTOR` + `GROUPED_MENU_TITLE_SELECTOR`），合成 =
> **[颗粒] 叠在（菜单填充 叠在 [地面] 上）** —— 与卡片**逐层同源**：
> `background-color` = 不透明 `--dsw-alias-bg-base`（挡住滚过的行），
> `background-image` = 颗粒、填充、地面（`grainOverGradients()`：颗粒 + 三段光，
> 后四层 `fixed` 按视口解析 → 小条不会被压成金带，见 §8.2 上面那段）。
> 地面颗粒的混合模式跟着轴走（浅 `multiply` / 深 `screen`，元素内部用 `background-blend-mode`）。
> 两处标题一起管（官方 `ModelSelect` 与本仓库 codebuddy 插件）。
> 实测（真机 0.1.7，截图取样）：浅色轴霜蓝差 ≤0.9 级、深色轴绯红亮度差 ≈1.1 级；
> 改前的上一版层序反了，差 +5 / −10 级（owner：「背景条又出来了」）。

### 8.3 官方默认档：门 + 两张 rung 表

`OFFICIAL_RUNGS`（官方绑定快照）与 `SURFACE_RUNGS`（我们选的档）**分开两张表**：
`tint === ''` 时 `surfaceFill` 一律走 `OFFICIAL_RUNGS`、且**不带任何图层**。
否则官方默认下 `layer-3` 会从官方的 `800` 被改成我们的 `875` —— 「官方默认完全不动」当场就破了。

玻璃与抬升面两张表的**每条规则**都带 `body:not([PLAIN_ATTR])` 前缀，由 client 按
`backdropPlan(...).hidden`（整层隐藏 == 这一轴就是官方默认）打上 / 摘掉，卸载时一并摘下。
CSS 仍静态注入（可测、不重解析），只是选择器不命中。三条测试分别钉住这三层。

### 8.4 跨插件的两处适配

| 插件 | 改了什么 | 为什么 |
| :--- | :--- | :--- |
| `dsh-chat-fim` | 灵敏度弹层逐项对齐官方 `.item`（`min-height` 32→40、`padding` 6→8、`border-radius` 8→10、`font-size` 13→14、`line-height` 20→22） | 同一插件内两个弹层不同档属于**观感事故**，留着比改更糟；改动只有排版数值 + 注释，不动逻辑与契约。两条测试钉住「同插件两弹层必须同档」且「都吃 `--dsw-specific-menu`」 |
| `dsh-codebuddy-credits` | 会话积分卡片宽度取 **260px**（`min(260px, calc(100vw - 24px))`） | 官方面板 `min-width` 是 300px，而这张卡是**短标签 + 一个数字**，撑到 300 就空得发慌。headless `max-content` 实测：中文 1 个模型 216.4px / 无模型 176px / 轮次行 186.4px / 超长 id 352.1px → 取 260 既有呼吸感又不空。测试钉住「是 260，既不是官方的 300、也不是更窄的 200」 |

## 9) 待真机调

1. **暗轴比例 `.14`**：偏淡 → `.18`；偏艳 → `.10`。改一个数字，全部色调与全部 rung 同步。
2. **浅轴比例 `.14`**（交互态 / 滚动条）：同上一档一档挪。**浅轴抬升面是 `0`（纯官方引用）**——
   要让它显形请改 `PANEL_TINT.light`，但先读 §4.0.1 的代价（会压住官方面色）。
   浅灰内嵌面（代码块 / 停靠卡）另走 `INSET_TINT.light`（现 `.12`，见 §4.0.2 第 14 条）。
3. **浮层是否「分不出是个弹窗」**：现锚 `bluish-875`（暗）/ `bluish-00`（浅，即官方纯白），整族一档。
   要拉开一点就把暗轴抬一档（`850`），**别退回官方的三档阶梯**
   （那正是「不统一」；也别忘了默认轴仍有 `OFFICIAL_RUNGS` 兜着）。
4. **是否收回 layer-1**：见第 5 节（影响面）。
5. **顶光面积**：现 `POPUP_TOP_SHAPE` 42%（可见约 20% 面高）。还是偏「色浆」→ 收到 34%（约 14%）；
   薄得看不见了 → 回到 48%（约 24%）。**别去动 `--dsh-theme-tone-top` 的 α**（那是实况的值）。
6. **浮层渐变收束**：`POPUP_STOP` 一档一档挪（`.76` → `.70` / `.82`）。
7. **颗粒在浮层上会不会发脏**：`POPUP_GRAIN_DATA_URI` 里那个 `.13` 是独立一格，
   与背景层的 `GRAIN_OPACITY` 同值但**可以单独降**（烘在贴图里，不影响背景层）。
8. **`@` 菜单**：它渲染在已经玻璃化的输入框卡片内部，是唯一「玻璃 + 抬升面」同屏的位置，目视一次。
9. **洗染是否看得出来**（`WASH_TINT` 深 `.25` / 浅 `.15`）：低 alpha 上本来就弱，偏淡 → `.35` / `.20`；
   注意**只能动这个比例，不要动 alpha**（alpha 是官方的档位差，改动会破坏「hover < 按下 < 强调」的层次）。
10. **选中态是否够显眼**：`--dsw-specific-sidebar-nav-item-active` 与 `-hover` 现在只差一档色阶，
    若真机上分不出「选中」与「划过」，浅轴可以把 `-active` 换成更深一档（`neutral-bluish-150`）。
11. **交互态与浮层同深**：浅轴 `bluish-60` 既是浮层锚点、又是模块面板的官方绑定 → 两者同深。
    嫌分不出就把浮层锚点挪到 `bluish-75`。
12. **分隔线是否够淡**（`BORDER_TOKENS` 走 `WASH_TINT`）：菜单里那条 `.separator` 只有 .06 的 alpha，
    染完色相仍几乎读不出 —— 想让它「跟得上」就把这五条**单独换一个更高的比例**（现在是共用洗染那档）。
13. **滚动条是否太艳**（`SCROLLBAR_TOKENS` 走 `SURFACE_TINT` 深 `.14`）：滑块比面小得多、又没有 alpha 缓冲，
    深轴上紫得可能过头 —— 偏艳就改用 `SURFACE_TINT.dark / 2` 那一档；偏灰就往上抬。
14. **浅灰内嵌面（代码块 / 三张停靠卡）太浅或太重**：`INSET_TINT.light`（现 `.12`）。
    偏重 → `.10`；偏淡（读不出边界）→ `.14`。**下界参考官方的 −5.1 阶**（再浅就与官方原值无异）。
    ⚠️ **两族的相对关系不要动**：代码块锚 `bluish-50`、停靠卡锚 `bluish-60`，是官方自己的层级差 ——
    要整族一起变浓淡就改这一个比例，**不要**把两者的锚点改成同一个（那会抹平官方差异）。
    深色轴同一常量（`.14`）。
15. **粘性分组标题的底色**：现在 = `bg-base`（不透明）+ 菜单填充图层 + 颗粒。
    合成本来就与卡片**同一套层**（算式见「适配完成报告」第九轮，浅轴实测差 1.4 级 = 噪点级），
    所以**没有**独立旋钮。若真机上仍觉得"那条与卡片不同"，**先分清是哪一半**：
    * 偏**亮/偏色** → 卡片背后是被 blur 的页面内容（标题拿不到），属已知近似；
      正解只能是给标题上 `backdrop-filter`，而实测那会把滚动的行糊进来（31.719/px），**不建议**；
    * 偏**脏** → 颗粒档位（改 `GRAIN_ALPHA` 一个对象，两处标题 + 卡片同时变，owner 要的"统一变量"）。
    ⚠️ **不许**把它改成半透明或 `background: none`：行会立刻透上来（owner 已否两次）。

## 10) 范围边界（染什么 / 不染什么）

* **不染**：**输入框**（`--dsw-specific-input-major`，它归玻璃那套，见 04-glass）、
  反色面（工具提示 / 轻提示）、零宽度描边（`border-inverted*`）、
  **语义色**（危险 / 品牌主按钮 / 成功错误警告，见 §7.2）。
* **染**：`--dsw-alias-bg-layer-1/2/3`、`--dsw-specific-menu`（**只给颜色**，见 §8.2）、
  **浅灰内嵌面**（`--dsw-specific-tip` + `--dsw-alias-markdown-code-block*`，独立通道见 §4.0.2）、
  **交互态**（导航选中 / hover / 模块面板 / 按钮面 / 低 alpha 洗染）、**框内元素**
  （描边五档 / 滚动条四条，§7.5），以及**悬停卡**（`body > [role='button']`，§6.3.2）。
* **「官方默认」下以上全部让路**：token 走 `OFFICIAL_RUNGS`，两张 CSS 表走 `PLAIN_ATTR` 门（§8.3）。
  顺带把**玻璃效果**也纳入这道门 —— 它虽然与色调无关，但会改顶栏与输入框的样子，同样不算「不动」。

「伤对比度」这条风险由 §4.1 的亮度不变式 + 真机目视复核兜住：染色只把本色混进**已经很亮的中性 rung**，
正文用的 `--dsw-alias-label-primary` 未动，暗轴浮层的三通道和仍在 128–188 一档（底色 36）。
渐变叠上去只会**加亮**（金与本色都比浮层底色亮），颗粒烘在 `.13`。
交互态同理：只挪一档色阶内的色相，明暗次序与 alpha 档位都原样（§7.4、§7.1）。

## 11) 验证方式

`file:` 协议被 `playwright-cli` 挡掉，所以起临时静态服务（`_poc/TEMP/`，仅临时文件）读 `getComputedStyle`：

| PoC | 验的是什么 | 结果 |
| :--- | :--- | :--- |
| `popup-surface-poc.html` | 按真实 DOM 摆菜单 / `@` 菜单 / 对话框 / 灯箱，注入与实现逐字相同的规则 | 三个浮层都拿到 `background-image` 且**填充不透明**（无 alpha）、无 `backdrop-filter`；灯箱 `background-image: none`、填充未被改动 |
| `anchor-check-poc.html` | 六条锚点各自的命中面 | 菜单 ✓ / 对话框 ✓ / 命令面板卡片 ✓ / `@` 菜单卡片 ✓ / 插件自有 listbox ✓ / 悬停卡 ✓；**灯箱 ✗、`@` 菜单内部视口 ✗**（两条排除都按设计生效）；命令面板内部视口 ✓（已知重叠） |
| `surface-compare-poc.html` | 整屏配方与浮层配方**并排**看是不是一种材质 | 浮层能读出「顶暖、底紫」的走向与颗粒，与左侧整屏同一族；不再是平的一块 |
| `dark-popup-fill-poc.html` | 深轴（幽林）**面板档 vs 更亮的灰板**并排 | 面板档下四个面板彼此完全同色、与左侧对话区读成同族；顶光与本色辉光在深底上直接可见 |
| `popup-unify-poc.html` | 深轴：整族一档 + 颜色全走 token | 四个面板**彼此完全同色**，含「无 `role`」那个也命中了颜色 |
| `scripts/verify.mjs` 里跑出来的 `tokenOverrides` 实值 | 交互态两族 + 框内两族 + 官方默认恒等 | 面走 `color-mix(…, var(--dsw-static-…))`；洗染与描边是**保 alpha** 的 `rgba(215, 211, 233, 0.08)` / `rgba(215, 211, 233, 0.06)` —— 8% 仍是 8%、6% 仍是 6%；滚动条走 `color-mix(…, var(--dsw-static-neutral-600))` |

真机复核走 GUI 本体（`http://127.0.0.1:3080`）—— 该地址需要 launcher 的鉴权，
带 token 的 URL 由 launcher 写进 `~/.dsh-launcher-panel/logs/server.log`；
**该 URL 含口令、只在会话内使用，不进仓库任何文件**。

| 查什么 | 实测 |
| :--- | :--- |
| 官方默认门 | `data-phase='hero'` 时 `data-dsh-theme-tone-plain` 在位、`data-ds-dark-theme` 在位 → 玻璃与抬升面两张表都不命中 |
| FIM 接线 | 样式已注入、`dsh-chat-fim-menu-anchor` 已挂载、编辑器是 `contenteditable` 的 `DIV`、无 `[data-trigger-menu]`（未展开时才没有） |

GUI 本体（`http://127.0.0.1:3080`）需要 launcher 的鉴权；带 token 的 URL 由 launcher 写进
`~/.dsh-launcher-panel/logs/server.log`，**该 URL 含口令、只在会话内使用，不进仓库任何文件**。
