# 02 · 路线图 — dsh-theme-tone

> 已实现的细节归各主题文档（03 调色板 / 04 玻璃 / 05 抬升面 / 06 滚动扫掠）与代码；本文件只记**里程碑状态**与**尚未做完的事**。

## M1 · 查证与定案 ✅

* 查证 pyai.site 素材（色相 / 底色 / 金光 / 颗粒的源码与 `dist` 产物一致）。
* 查证 DSH 侧：明暗 token 与值、4 个不透明底色面、`--dsw-alias-bg-base` 的复用面、
  `ctx.theme.overrideTokens` / `getTheme`、`ctx.settingsScope.bind`、`settings.general.item` 槽位、
  `PLATFORM_MODULES` 种子词、`packages/client/**` 的 z-index 分布、应用外壳无 CSP。
* 查证本仓库先例：`dsh-codebuddy-credits` 已有「`settings.register` + schemastery + React 设置卡 +
  `ctx.slots.inject` + 双语文案」全套接线（M4 照此接线）。
* 定案：设置行位置 `order: 10.5`（插在官方外观 10 与字号 11 之间）；背景层 `z-index: 80`；
  两轴都给「官方默认」档；色调卡完整展示色调；中文标签走意境名。

## M2 · 脚手架 ✅

* `package.json`（`dsh.bundle.patch` + `dsh.client.platform/inject`、`files` 清单）、
  `cordis.patch.yml` / `dev.patch.yml`、`tsconfig.json`、`scripts/bundle-client.mjs`。
* `src/compat.ts`：能力门纯函数 + `cssSupports` / `hasCapability` 探针 + 单测。
* 查证补记：`ctx.slots` 的类型来自 **`dsh-client-ui-renderer`**（不是 ui-slots）—— 少这个
  type-only import 编译不过。

## M3 · 纯逻辑与数据 ✅

* `src/tones.ts`（两轴色调表 + 默认值 + 类型 + 取值回落）、`src/settings-schema.ts`
  （schemastery schema **与色调表分离**，保证它不进客户端 bundle，有结构测试钉住）。
* `src/constants.ts`（命名空间 / 槽位坐标 / z-index / 行 order / DOM 标记 / CSS 变量名）。
* `src/backdrop.ts`（CSS 文本构造、`backdropPlan`、`tonePreview` + `boostAlpha`、
  颗粒 data URI、种子特性门清单）。

## M4 · 实现 ✅

* `src/host.ts`：`ctx.inject(['settings'], …)` + `settings.register('ui-theme-tone', schema)`
  （与官方 ui-theme 同法；`installSection` 是给需要进程内取值的消费者用的，本插件客户端经
  `settingsScope` 读，用不上）。
* `src/client/index.ts`：能力门 → `ctx.locale.register` → `settingsScope.bind` →
  `overrideTokens`（变色调才重写，兼作防自激环闸门）→ 样式表 + 背景层 →
  `ctx.slots.inject('settings.general.item', …)` → `theme/change` 与 scope 订阅驱动 store sync →
  `ctx.effect` 清理。
* `src/client/ThemeToneRow.tsx` + `store.ts` + `locales.ts` + `styles.ts`：镜像官方外观行视觉；
  只渲染当前轴的 `available` 色调；卡面内联完整色调预览。

## M5 · 玻璃效果（顶栏 + 输入框）✅

> 细节见 [04-glass.md](04-glass.md)。**前提已查证**：只有输入框底座真正压在滚动内容之上；顶栏必须先浮层化。

* `src/glass.ts`：顶栏浮层三件套（定位祖先 / `[data-slot] > *` 浮起 / 滚区补 76px）+
  输入框卡片玻璃（填充 + 模糊 + 边光 + 悬浮投影）。
* 输入框底座 `::after` 的**不透明背衬** + 停靠卡之间的**缝挡板**（`buildSeamCss`）。
* 相位：卡片那两条走 `active` + `hero`（首页也要玻璃）；其余规则死守 `active`。

## M6 · 抬升面（菜单 / 模态 / 提示条 / 抬升卡片）✅

> 细节见 [05-surfaces.md](05-surfaces.md)。

* `src/tones.ts`：本色抽成 `ToneSpec.tint`（一处定义），`bottom` 与浮层染色都由它派生；
  `SURFACE_TOKENS` + `SURFACE_RUNGS`（引用官方 static 变量，防自引用环）+ `PANEL_TINT` / `SURFACE_TINT`。
* 插件自己的光色变量经 `LIGHT_TOKENS` **发到 token 层** —— 浮层是 portal 到 `body` 的官方元素，
  读不到背景层元素上的内联变量；顺带白拿「两轴一次给全 + 切轴自动改 + 卸载自动回收」。
* `src/surface.ts`：语义锚点 + **只压 `background-image`** 的三层配方（颗粒 / 顶光 / 底光）；
  几何常量 `POPUP_*` 放进 `backdrop.ts`（几何只有一处事实来源）。
* 交互态两族（不透明态面走 `color-mix`；低 alpha 洗染走 JS **保 alpha 只换 RGB**）+ 框内元素
  （描边五档 / 滚动条四条）。
* 跨插件适配：`dsh-chat-fim` 的弹层尺寸对齐、`dsh-codebuddy-credits` 会话积分卡宽度。

## M7 · 滚动扫掠 ✅

> 细节见 [06-run-sweep.md](06-run-sweep.md)。

## M8 · 真机验证与发布

装机已完成：`~/.dsh/profiles/web/package.json` 的 `dependencies`（`link:`）与
`dsh.profile.bundles` 各加了一行，`pnpm install` 已跑、junction 已建。
profile 级 `cordis.patch.yml` **保持 `[]`**（插件经 bundle 装载，往 profile patch 写 insert
会 `duplicate loader entry id` 启动失败）。

* [x] 设置行出现在「外观」正下方；色调卡完整展示色调；卡面文字「默认」；8 款全部可选。
* [x] 逐款观感与对比度经真机目视确认（8 款）；浅色三款差异足够。
* [x] 四张卡恒排一行；切明暗行内容立即刷新。
* [x] 持久化：重启 dsh 后选择保留，`settings.yaml` 出现 `ui-theme-tone`。
* [x] 卸载还原：停用插件后 token / 层 / 样式表 / 设置行全部回收。
* [ ] 零布局影响：开关前后 `document.body.scrollHeight` 不变。
* [ ] 交互不受影响复核：菜单、tooltip、拖拽条、输入框、弹窗；层级切分符合定案。
* [ ] 截图（8 款）存 `resources/dsh-theme-tone-*.png`。
* [ ] 对发布执行《代码审计》；README / CHANGELOG 与实现对齐；按根 AGENTS「发布（npm 包）」流程发布。
