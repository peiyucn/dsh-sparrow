# 01 · 设计 — dsh-theme-tone

> 本文是 seam 查证结论 + 架构，与实现一一对应。
>
> **查证基线**：本机 dsh checkout `~/.dsh-launcher-panel/source`，`0.1.5-rc.2`，HEAD `fb2c4b9e698e30edb738bca4cf0618587db7d203`（tag `dsh-v0.1.5-rc.2`）。

## 1) seam 查证结论（全部为公开 seam，且本仓库已有先例）

| 需要什么 | 官方 seam | 官方出处 | 本仓库先例 |
| :--- | :--- | :--- | :--- |
| 持久化设置（宿主侧注册命名空间） | `ctx.inject(['settings'], c => c.settings.installSection(ctx, ns, schema, entry, hooks))` | `settings/README.md:58`、`settings/src/index.ts:472` | `dsh-codebuddy-credits/src/index.ts:520` |
| 持久化设置（客户端读写） | `ctx.settingsScope.bind({ namespace })`，`inject` 加 `'settingsScope'` | `ui-settings/README.md:32/58`、`ui-settings/src/client/settings-scope.ts:221` | 官方 `ui-chat/src/client/apply.ts:82`、`ui-conversation/src/client/apply.ts:129`、`ui-settings-plugins/src/client/index.ts:68` |
| schema 类型 | `@deepseek-ai/schemastery` 的 `z.object` | `settings/src/index.ts:421`（`schema: z<T>`） | `dsh-codebuddy-credits/src/config.ts:10`（已把它列为 dependency） |
| 设置行 UI | `ctx.slots.inject('settings.general.item', () => ctx.slots.register({ name, id, order, locale, store, inject }, Component))` | 槽位声明 `ui-settings/src/client/contract/slots.ts:89`（`{ kind: 'list', scope: 'root' }`）；`inject` 签名 `ui-renderer/src/client/registry.ts:172` | 官方 `ui-theme/src/client/index.ts:454`（外观 order 10）/ `:470`（字号 order 11）；React 设置卡先例 `dsh-codebuddy-credits/src/client/index.ts:194` |
| 运行时 React / store / 官方视觉件 | `PLATFORM_MODULES`（**种子词**，任何插件包恒可 `require`）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit` | `client/web/src/platform.ts:8-14`；解析序 `client/modules/src/client/system.ts:195-211` | `dsh-codebuddy-credits/scripts/bundle-client.mjs:18`（esbuild external 同一批） |
| 行文案 zh / en | `ctx.locale.register(ns, { zh, en })` | — | `dsh-codebuddy-credits/src/client/index.ts:188` |
| 色调 → 颜色 token | `ctx.theme.overrideTokens(source, { light, dark })`；**同 source 再调即整层替换** | `ui-theme/src/client/index.ts:308`（注释明说「Calling again with the same source replaces that source's whole layer」） | 无（本插件首个） |
| 读当前明暗 + 订阅变化 | `ctx.theme.getTheme()` / `ctx.on('theme/change', …)`，`inject` 加 `'theme'` | `ui-theme/src/client/index.ts:202/444` | — |

**生效链路（token 侧，已逐环验证）**：`overrideTokens` → `ThemeRuntime.composeActive` 按 seq 折进 `snapshot.active.tokens` 并按当前 `colorScheme` 取值（`:343-352`）→ `ThemePresenter.apply` 逐个 `body.style.setProperty(name, value)`（`ui-layout/src/client/theme-presenter.ts:50-53`）→ **inline 样式**，赢过任何样式表顺序；presenter 只回收自己写过的 token（`:48`、`:64`），卸载即净。

## 2) 两个轴为什么用不同配方

pyai.site 的光晕与颗粒都靠 `mix-blend-mode: screen`：在**深色底**上 screen 是纯加法，只加亮、永不压暗或遮住内容，所以敢压在内容之上。

**浅色底上 screen 会饱和失效**——`1-(1-a)(1-b)` 在接近白的底上结果仍接近白，等于什么都没画。所以：

* **深色轴**：`mix-blend-mode: screen`，顶部/底部径向染色，沿用 pyai.site 配方。
* **浅色轴**：`mix-blend-mode: normal`（正常合成）+ 低 alpha 染色。观感上浅色三款不是「深空光晕」，而是**官方白底 + 主色打光**。
* **颗粒**：深色轴 `screen`；浅色轴换 `multiply`（白底上要往下刻出纹理），opacity 也相应不同 —— 见 03-palette。

一款色调 = 一组 `{ base, sidebarFill, tint, top, bottom, left, grain }`；`blend` 由**轴**决定（CSS 属性选择器 `body[data-ds-dark-theme]` 分流，不需要 JS）。

## 3) 数据模型

settings 命名空间 `ui-theme-tone`（小写连字符文法是 `register` 的硬要求，`settings/src/index.ts:417`）：

```ts
export type ToneId =
  | 'official'                              // 官方默认（两轴都有）
  | 'violet' | 'crimson' | 'forest'         // 深色轴
  | 'blue' | 'sakura' | 'green'             // 浅色轴
export type LightToneId = 'official' | 'blue' | 'sakura' | 'green'   // 顺序 = 渲染顺序，与深色轴逐位对应
export type DarkToneId = 'official' | 'violet' | 'crimson' | 'forest'

export interface ThemeToneSettings {
  lightTone: LightToneId
  darkTone: DarkToneId
}
// 默认：{ lightTone: 'official', darkTone: 'violet' }
```

**色调表每项带 `available` 开关**（8 款全部 `true`；留位 / 下架时翻成 `false`，设置行即不渲染）：

```ts
interface ToneSpec {
  available: boolean        // false = 留位 / 下架：有键、有色值，但设置行不渲染
  base: string              // 底色
  sidebarFill: string       // 左栏填充
  tint: string              // 本色 'R, G, B'（一处定义，三层光与抬升面染色都由它派生）；'' = 无本色
  top: string               // 顶部径向染色；'' = 不画
  bottom: string            // 底部径向染色；'' = 不画
  left: string              // 左侧光晕（左栏与接缝）；'' = 不画
  grain: boolean            // 是否叠颗粒
}
```

* `official` 的 `base` / `sidebarFill` 传**官方变量引用**（`var(--dsw-static-neutral-bluish-950)` 等），不硬编码——官方换色自动跟随；`tint` / `top` / `bottom` / `left` 为空、`grain: false` → 背景层隐藏，等价于没装插件。
* **浅色三款的 `base` / `sidebarFill` 也引用官方变量**（不是写死 `#fff`）：语义是「底色 = 官方配置」，官方调整浅色底时三款自动跟随。**三款底色完全相同** —— 调和色调只由 `tint` 与三层光表达。

**为什么是两个字段而不是一个**：一个字段无法同时服务两条轴——浅色的「霜蓝」在深色下没有意义。两个字段让「切浅色 → 选苔青 → 切回深色」保留深色侧的选择，是唯一不丢选择的模型。

**为什么默认深色是 `violet`**：这就是 pyai.site 那款，也是本插件的存在理由；装了就见效。想改成「装上先无感」只需把默认值换成 `official`（一个常量）。

## 4) 渲染

### 4.1 底色 + 左栏填充 → `overrideTokens`

```ts
release = ctx.theme.overrideTokens('@dsh-sparrow/dsh-theme-tone', {
  '--dsw-alias-bg-base': { light: tone.base, dark: tone.base },        // 取当前轴那一款的 base
  '--dsw-specific-sidebar-fill': { light: tone.sidebarFill, dark: tone.sidebarFill },
})
```

* 每次色调变化就**用同一个 source 再调一次**——官方注释保证这是「整层替换并重排到顶」，不需要手动 dispose 再注册。
* **仍然两个模式都必填**（`validateOverrides` 对裸字符串抛教学错误，`:385-390`）：传入当前轴那一款的值，非当前轴传**该轴当前选中款**的值。即：深色轴选深红、浅色轴选白蓝时，`base` 传 `{ light: 白蓝.base, dark: 深红.base }`——这样用户切轴时颜色已经在位，无需等插件重新写入。
* **为什么染左栏**：不染的话，深色「蓝紫」底 + 左栏 `#1b1b1c` 中性灰，观感是「半色调」，左右不一致。`--dsw-specific-sidebar-fill` 是官方 `BUILTIN_INSPECT_TOKENS` 里列出的合法覆盖目标（`ui-theme/src/client/index.ts:144`，描述 "Sidebar column and title-row background"）。
* **为什么不染 `--dsw-alias-bg-layer-1/2/3`**：卡片 / 菜单 / 弹窗靠这几个 token 出层次，染它们会把「浮起来的面」压回底色，伤层次与对比度。保持中性是正确的分工。

### 4.2 光晕 + 颗粒 → 插件自有固定层

```html
<div class="dsh-theme-tone" data-dsh-theme-tone aria-hidden="true"></div>
```

```css
.dsh-theme-tone {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 80;                    /* 层级切分见 4.3 */
  background-image:
    radial-gradient(ellipse 80% 45% at 50% -10%, var(--dsh-theme-tone-top), transparent 62%),
    radial-gradient(ellipse 70% 45% at 50% 112%, var(--dsh-theme-tone-bottom), transparent 62%),
    radial-gradient(ellipse 38% 58% at 0% -6%, var(--dsh-theme-tone-left), transparent 68%);
}
.dsh-theme-tone::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.13;
  background-image: url("data:image/svg+xml,…feTurbulence fractalNoise…");
}

/* 深色轴：只加亮，敢压内容之上 */
body[data-ds-dark-theme] .dsh-theme-tone { mix-blend-mode: screen; }
body[data-ds-dark-theme] .dsh-theme-tone::after { mix-blend-mode: screen; }

/* 浅色轴：正常合成；颗粒默认关 */
body:not([data-ds-dark-theme]) .dsh-theme-tone { mix-blend-mode: normal; }
body:not([data-ds-dark-theme]) .dsh-theme-tone::after { display: none; }
```

* **色调参数走 CSS 变量，不走改样式表**：`apply` 时在层元素上 `style.setProperty('--dsh-theme-tone-top' | '-bottom' | '-left', …)`；换色调只改变量，样式表只注入一次。左侧金晕是可选层：色调不给就 `removeProperty`，样式表里的 `transparent` 兜底。
* **左侧金晕为什么锚视口左上角、而不是按接缝定位**：官方没把左栏宽度暴露成 CSS 变量 —— 宽度是 `SidebarRoot` 的 inline style（`SidebarRoot.tsx:173`），列轨道是 AppFrame 的 inline `grid-template-columns`（`AppFrame.tsx:207`），元素本身只有 hashed 类名、没有 `data-*` 钩子（已 grep 确认）。按接缝定位就得 JS 观测元素宽度 + ResizeObserver，破「低常驻开销」且多一处泄漏面。锚左上角的椭圆在左栏 264–420px（`columns.ts:13-17`）之间变化时观感都成立，且左栏右缘一带自然收束成金色渐变。
* **`data:` URI 纹理可行**：应用外壳未设 CSP——`packages/**` 全树 grep `Content-Security-Policy` 只命中 `api/session-controller/src/media-references.ts:19`（媒体响应自己的 `sandbox; default-src 'none'`，与应用 index 无关）；且 `dsh-nav-pin` 已有在 `apply` 内注入 `<style>` 的先例。
* **整层叠在内容之上**：因为底色面各自不透明且分散在 4 处（见 00「痛点与根因」3），垫底下会被盖住；改透明有实证代价（见「已否决方案」1）。深色轴靠 screen 保证不遮内容；浅色轴靠低 alpha 保证不碍阅读。
* **层的显隐由 JS 决定**：当前轴的色调是 `official`（`top`/`bottom` 为空）→ 给层加 `hidden`，不画任何东西；`grain: false` 时给层加 `data-grain="off"`（CSS 里 `[data-grain="off"]::after { display: none }`）。两者都靠「订阅 `theme/change` + settings 变更 → 重算 → 写 DOM」驱动；不用 CSS 表达式，因为 `display` 无法由自定义属性决定。

### 4.3 层级切分

官方客户端 z-index 实测分布（grep `z-index`）：拖拽条 11 / `.overlayLayer` 20 / SidebarRight 40、60 / dockkit 70 / 菜单·tooltip 100–101 / Modal·Settings·lightbox 1000 / toast·onboarding·ModelSelect 1100。

**定案 `BACKDROP_Z_INDEX = 80`** —— 切在 dockkit(70) 与菜单(100) 之间：应用底 + 左右栏 + 对话区统一着色；菜单、tooltip、弹窗、toast 保持官方中性面（瞬时前景不该被环境色污染）。

代价是**内容必须抬到层之上**（否则正文也被染色）→ `[data-conversation-scroll]` 抬到 81，而原本压着它的官方层必须跟着抬到 82（`ABOVE_CONTENT_Z_INDEX`）、dockkit 的标签菜单到 83（`ABOVE_FLOAT_HOST_Z_INDEX`）—— 这是一条**不变式**，清单与理由见 `constants.ts`。

> 否决过的两档：`1200` 会盖过弹窗（最贴近 pyai.site「颗粒盖全站」，代价是弹窗也裹一层色调）；`30` 会让右栏(40/60) 与 dockkit(70) 不被着色，左右栏不对称。

## 5) 设置行 UI

```ts
// 客户端 apply 内
ctx.slots.inject('settings.general.item', () => ctx.slots.register({
  name: 'settings.general.item',
  id: 'theme-tone',
  order: 10.5,                  // 官方：外观 10、字号 11 → 取小数插在两者之间
  locale: 'theme-tone',
  store: rowStore,              // defineStore：{ colorScheme, tone, revision }
  inject: (actions) => ({ setTone: (id) => { scope.set(fieldFor(activeAxis), id) } }),
}, ThemeToneRow as unknown as (props: object) => ReactNode))
```

* **行顺序用小数**：官方「外观」占 10、「字号」占 11，两个整数都被占了；列表槽按数值升序渲染（`ui-slots/src/index.ts:905-907`），所以 `10.5` 就是「紧挨官方外观下面」而不动官方任何东西。
* **色调卡完整展示色调**：卡面背景由 `backdrop.ts` 的 `tonePreview(scheme, id)` 内联给出 —— `backgroundColor` = 该色调底色，`backgroundImage` = 顶部 / 底部染色 + 左侧光晕，色值与真实背景层同源。按卡片尺度做两处调整：① 几何换成 `PREVIEW_*_SHAPE`（整屏形状在卡上会把染色整个落在盒外）；② **按轴 / 按层决定放大倍数**（见 `PREVIEW_ALPHA_SCALE`）：判据 = 「卡面需要多少」÷「实况已有多少」—— 现值为深色 `light ×1 / depth ×3`、浅色 `light ×3 / depth ×1.8`。深色纵深放大是帮 135×83 的小卡看得见；浅色三层都要放大，因为实况 alpha 很淡（`.16/.30/.19`）而小卡面积小、渐变被压缩，不放大三款就分不清（实测区分度会掉到人眼阈下）。
* **卡面颗粒**：由 `.cube::after` 承担（同一条 data URI、同一 `opacity`、同一 `mix-blend-mode`），因为 `mix-blend-mode` 没法用 inline style 表达。组件只按 `tone.grain` 打 `data-grain`；卡加 `overflow: hidden` + `isolation: isolate` 把颗粒裁进圆角、且不渗到卡外。
* **卡高与官方「外观」卡等高**：`min-height: 83px` = 官方 `themeCube` 的 `padding 20×2 + 图标 16 + gap 4 + 行高 22 + 边框 .5×2`（图标尺寸查证自 `ui-primitives/src/icons/index.tsx:698-699`）。本卡无图标，用 `min-height` 补齐而不是靠内容撑；有测试按同一算式钉住（改官方卡的结构会让这条测试提示复核）。
* **`boostAlpha` 对不认识的输入原样返回**（空串 / hex / `var()`）—— 安全默认，不猜；`boostAlpha(x, 1)` 是恒等。
* **样式表不给卡片设背景**：inline 优先级高于样式表，样式表再写 `background` 只会静默失效并与内联底色打架 —— 因此悬停用 `border-color`、选中用 `label-primary` 描边环（`box-shadow: inset …`）表达。用 `label-primary` 是因为它在本轴内必然与色调卡对比（暗色轴上近白、浅色轴上近黑，而卡片正是该轴的深 / 浅色）。
* **一排四张、等宽等分**：`cubeRow` 用 `flex-wrap: nowrap`，`cube` 用 `flex: 1 1 0` + `min-width: 0`。
  **不能用固定 basis + 允许换行**：四张卡放不下时第 4 张会独占第二行，并被 `flex-grow` 拉满整行（左锚光晕在超宽卡上会糊成一大片）。有回归测试钉住 `nowrap` / `flex: 1 1 0` / 不得出现固定 basis。
* 组件复用官方外观行的视觉语言（`AppearanceRow.tsx:44-61` 的 `group` + `title` + `cubeRow` 结构与描边 / 圆角 / 内边距）——但**分栏策略不同**：官方那行只有 3 个固定 `flex: 180px` 的 cube，我们有 4 张且要恒排一行。
* 行内状态由 store 镜像，`sync` 由 `apply` 世界的 `theme/change` 订阅与 settings scope 订阅驱动——**与官方外观行同构**（`ui-theme/src/client/index.ts:436-453`）：`revision` 守卫丢弃过期写入，注册后立刻 `sync(theme.getTheme())` 避免丢事件。
* **只渲染当前轴的 `available` 色调**；切轴由 store 里的 `colorScheme` 触发重渲染。8 款全部可选（深色 4 / 浅色 4）。
* **标签走意境名**（深空 / 余烬 / 幽林 / 霜蓝 / 樱花 / 苔青）——颜色已由卡面表达，标签只负责给氛围定名；`official` 保持功能性命名（「默认」）。
* **不写死「设置」标题层级**：本行是自己的 `title`（「色调」）+ 卡组，与官方「外观」「字号」并列，不假装属于官方外观行。

### 为什么是同区紧邻的自有行

* **本方案**：`id: 'theme-tone'`、`order: 10.5`，带自己的标题，视觉与官方行一致。风险最低、官方改外观行不受影响。
* **塞进官方外观行内部（否决）**：做不到「扩展」——官方外观行没有声明子槽位（`children` 表里没有可用键，`ui-theme/src/client/index.ts:454` 的注册未声明 children）。要真正合并，只能**shadow 官方整行**：list 槽位同 `id: 'appearance'` 且 `priority < 0`（list 单元「最低 priority 渲染」，`ui-slots/src/index.ts:975-991`）才能压过官方的 `priority 0`。代价：我们要复刻官方那 3 个 cube 的 markup、图标与样式，且官方一改外观行就跟不上。

## 6) 兼容门（根规范《扩展与宿主兼容》）

`apply` 开头按 `src/compat.ts` 自检。**两半的门语义不同，不可互换**：

* **client half 走惰性停用**（`warnMissingCapabilities`：告警 + 直接 return，**不抛错**）。理由（实测）：客户端 boot 审计把「任一 entry 非 active」当**致命**失败，`apply` 抛错或 fiber 停在 pending 都会让 `bootClient` 抛 `web boot: N entry did not activate`，宿主整个 Web UI 只渲染失败页（dsh 0.1.7-alpha.1 `packages/client/web/src/boot-client.ts:63-82`）。插件宁可自己什么都不画，也不能拖垮宿主启动。
* host half 没有必需服务（settings 走可选注入），故不需要门。其余只在 host half 装门的插件（archive / chat-fim / codebuddy / file-manage）继续用抛错自停用 —— cordis 逐插件捕获 `apply` 异常并把该插件标 inactive，dsh 与其余插件不受影响（`lib/index.js:1350-1362`）。

**`inject` 只放跨版本稳定存在的服务**（`['theme', 'slots', 'locale']`）：inject 里放了新版宿主已经改名 / 移除的服务，fiber 会永远 pending，同样是致命失败（pending 判定见 `boot-client.ts:73-75`）。设置读取面（0.1.5-rc.2 的 `settingsScope`）是易变面，改走**可选依赖 fork** `ctx.inject(['settingsScope'], …)`：

* 服务出现就装（0.1.5-rc.2 上 ui-settings 常晚于本 entry 提供它，fork 正好等它）；
* 这条宿主线没有该服务（0.1.7-alpha.1 起改名 `configForms`）→ fork 一直挂着，本插件什么都不做；
* fork 是本 entry 的**子 fiber**，不进 `bootClient` 审计的 entry 列表（`ctx.loader.entries()`），所以它 pending **不会**让宿主启动失败 —— 这正是本插件要的结果。
* **不写「惰性停用」告警**：apply 那一刻无法区分「服务还没到」与「这条线没有」（0.1.5-rc.2 实测就是还没到），写了只会在受支持的那条线上误报。可靠提示要等适配 0.1.7 时按 `configForms` 走正路，见下面的「已知不兼容线」。

* **能力门（客户端，跨版本稳定面）**：`typeof ctx.theme?.overrideTokens === 'function'`、`typeof ctx.theme?.getTheme === 'function'`、`typeof ctx.slots?.inject === 'function' && typeof ctx.slots?.register === 'function'`、`typeof ctx.locale?.register === 'function'`；缺任一 → 告警 + 惰性停用（不注册任何东西）。
* **能力门（宿主）**：`ctx.get('settings')` 可为空——`installSection` 本身支持「服务不存在时回退到组合 entry 配置」；但那样**选择无法持久化**，按 ui-theme 对非 loopback 的口径降级为进程内状态，并在日志里说明。
* **浏览器特性门**：`CSS.supports('mix-blend-mode', 'screen')`（深色轴配方依赖）；径向渐变用 `CSS.supports('background', 'radial-gradient(red, blue)')`。缺任一 → 停用（**不降级**为正片叠底：浅色配方不依赖 blend，但深色配方是非 screen 就会压暗内容）。
* **无会话格式门**：本插件不读会话数据。
* 判定纯函数化并补单测（含「不兼容 → 告警 + 惰性停用（不抛错）」接线用例）；停用文案统一为「已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）」。
* **已知不兼容线**：官方 0.1.7-alpha.1 起客户端设置基座服务由 `settingsScope` 改为 `configForms`（`packages/client/ui-settings/src/client/config-form.ts:266`）。本插件只承诺版本号所标示的那条线（0.1.5-rc.2）；在 0.1.7+ 上按上面的 fork 机制**什么都不做**（不报错、不拖垮宿主启动），适配属于后续正式任务。

## 7) 生命周期与去重

* `apply` 内：能力门（不通过即 return）→ 注册 locale 字典 → `settingsScope.bind` → `ctx.theme.overrideTokens` → 注入样式表 → 插入背景层 → 注册设置行 → 登记订阅（`theme/change` + scope 订阅）。所有副作用收进 `ctx.effect` 清理，卸载顺序与插入相反。
* **HMR / 重载去重**：样式表按 `style[data-dsh-theme-tone]` 命中即复用并按内容刷新；背景层按 `[data-dsh-theme-tone]` 命中即复用（同 `dsh-nav-pin`）。
* **不产生写入循环**：`theme/change` 与 scope 订阅只读不写；写入只发生在立方块点击。
* client half 不 import Node 模块；host half 只做 settings 命名空间注册（`@deepseek-ai/schemastery` 在 host half 用，client bundle 不需要它）。

## 8) 已否决方案（含实证理由）

1. **把 `--dsw-alias-bg-base` 改成 `transparent`，让染色现于 `html` / `body`** —— 该 token 被约 20 处当作不透明填充复用、被 5 处 `color-mix(…, transparent)` 消费（清单见 00「痛点与根因」4）→ 卡片/代码块失去面、滚动渐隐 mask 失效。附带代价：`ThemePresenter` 从 `getComputedStyle(body).backgroundColor` 生成 `meta[name="theme-color"]`（`theme-presenter.ts:54`），body 透明会让该值失真。
2. **把径向染色加在官方 hashed CSS-module 类名上**（`.frame` / `ConversationRoot` 等）—— 依赖构建期 hash 的私有 seam，且底色面分散在 4 处需逐个补齐；违反 dsh-sparrow AGENTS《插件契约 · 禁止》「硬编码 dsh 内部布局」。
3. **`ctx.theme.register({ id, colorScheme, tokens })` 注册三方主题** —— 注册的三方 id 不在 `THEME_PREFERENCES`（`theme-settings.ts:4`）内，「设置 → 外观」的持久化经 `isThemePreference` 校验（`:35`），用户**无法从 UI 选中**（`setTheme('id')` 只能程序化调用）。
4. **单个 `tone` 字段** —— 无法同时服务两条轴，切轴会丢选择。见 3)。
5. **浅色轴沿用 screen 配方** —— 白底上 screen 饱和失效，等于没画。见 2)。
6. **染色只改 `--dsw-alias-bg-base`** —— 左栏仍是中性灰，出现「半色调」违和。见 4.1。
7. **shadow 官方外观行以合并两行** —— 见 5)「为什么是同区紧邻的自有行」，要复刻官方 markup 且跟不上官方改动。
8. **做透明/强度/自定义取色设置项** —— 六款色调已经覆盖需求；要关掉直接停用插件。避免设置面膨胀。
9. **把左侧金晕做成「贴在左栏右缘的描边」** —— 想过两条件更好的路，都有实证代价：
   * 走 `--dsw-specific-sidebar-fill`（把渐变塞进这个 token，`background: <gradient>, <color>` 合法）：**会打断 `ui-workspace/.../WorkspaceBrowser.module.css:318`** —— 那里把它当作 `linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill))` 的**颜色停靠点**用，渐变值会让整条声明失效（工作区浏览器的底部渐隐消失）。其余三处消费点（`AppFrame.module.css:28` / `SidebarRoot.module.css:16` / `TrajectoryTable.module.css:154`）都是 `background:` 简写，能吃渐变 —— 一处坏就否掉整条路。
   * 按真实接缝定位（`left: <左栏宽>`）：官方没有可用的 CSS 变量或 `data-*` 钩子（见 4.2），只能 JS 观测 + ResizeObserver。
   → 最终取「锚视口左上角」的椭圆，零 JS、左栏任何宽度下都成立。
10. **色调卡复用整屏染色几何 / 原始 alpha** —— 两个都不行：`ellipse 80% 45% at 50% -10%` 在 ~135×83 的卡上把染色整个落在盒外；即便换成卡片尺度几何，环境级 alpha（`.16`–`.30`）在小卡上仍读不太出来，卡面照样是纯色。→ 改为同源色值 + `PREVIEW_*` 几何 + `PREVIEW_ALPHA_SCALE` 放大 alpha（实层不动）。

## 9) 设计定案

1. 设置行位置 → **同区紧邻的自有行**（`id: 'theme-tone'`、`order: 10.5` 插在官方外观 10 与字号 11 之间、带自己的标题）。不 shadow 官方外观行。
2. 层级切分 → **`z-index: 80`**（应用底 + 左右栏 + 对话区着色；菜单 / tooltip / 弹窗 / toast 保持官方中性面）。见 4.3。
3. 色调卡形态 → **完整展示色调**：卡面 = 底色 + 顶部/底部染色 + 左侧光晕（同一套色值，几何换成卡片尺度）；选中态用描边环，因为卡面已被色调占用。
4. 中文标签 → **走意境名**（深空 / 余烬 / 幽林 / 霜蓝 / 樱花 / 苔青），颜色由卡面表达。
5. 左侧光晕的实现方式 → **锚视口左上角的椭圆**（不给左栏加描边、不按接缝定位，理由见 8) 第 9 条）。
6. 默认值 → **深色默认 `violet`（蓝紫，装上就见效）、浅色默认 `official`**；两轴都提供「官方默认」档，用户随时可切回官方。
7. 落地范围 → **8 款全部可选**（深色 4 / 浅色 4）。
8. 浅色轴要不要颗粒 → **要**：白底上用 `multiply` + `.16`（`screen` 在白底饱和失效）。见 03-palette。
9. **`preference: 'system'` 下色调归属** → 按宿主解析出的 `colorScheme` 取该轴的色调（`system` 由官方 ui-theme 解析，本插件只读解析结果）。

## 10) 适配版本基线

本机 dsh checkout `~/.dsh-launcher-panel/source`（`0.1.5-rc.2`）。本文引用的官方事实出自：`design-platform.css` 的 `--dsw-alias-bg-base` / `--dsw-specific-sidebar-fill` 行号与值、`ThemeRuntime.overrideTokens` 与 `getTheme` 签名、`settings.general.item` 槽位声明、`PLATFORM_MODULES` 清单、`packages/client/**` 的 z-index 分布。
