# 02 · 路线图 — dsh-theme-tone

> 已实现的细节归各主题文档（03 调色板 / 04 玻璃 / 05 抬升面 / 06 滚动扫掠）与代码；
> 本文件只记**已完成的范围**与**尚未做完的事**。

## 已完成

| 范围 | 落地物 | 细节 |
| :--- | :--- | :--- |
| 查证与定案 | pyai.site 素材（色相 / 底色 / 金光 / 颗粒，源码与 `dist` 产物一致）；DSH 侧明暗 token、4 个不透明底色面、`--dsw-alias-bg-base` 的复用面、全部公开 seam、`packages/client/**` 的 z-index 分布、应用外壳无 CSP | 01-design §1、§9 |
| 脚手架 | `package.json`（`dsh.bundle.patch` + `dsh.client.platform/inject`、`files` 清单）、`cordis.patch.yml` / `dev.patch.yml`、`tsconfig.json`、`scripts/bundle-client.mjs`、`src/compat.ts`（能力门纯函数 + 探针 + 单测） | 01-design |
| 纯逻辑与数据 | `src/tones.ts`（两轴色调表 + 默认值 + 类型 + 取值回落）；`src/settings-schema.ts`（schemastery schema **与色调表分离**，保证它不进客户端 bundle，有结构测试钉住）；`src/constants.ts`；`src/backdrop.ts` | 03-palette |
| 接线 | `src/host.ts`（`ctx.inject(['settings'], …)` + `settings.register`）；`src/client/index.ts`（能力门 → locale → `settingsScope.bind` → `overrideTokens` → 样式表 + 背景层 → `settings.general.item` 槽位 → `theme/change` 与 scope 订阅 → `ctx.effect` 清理）；`ThemeToneRow.tsx` + `store.ts` + `locales.ts` + `styles.ts` | 01-design §4.1–4.3 |
| 玻璃效果 | 顶栏浮层三件套 + 输入框卡片玻璃（填充 + 模糊 + 边光 + 悬浮投影）；底座 `::after` 不透明背衬 + 停靠卡缝挡板；相位（卡片走 `active` + `hero`，其余守 `active`） | 04-glass |
| 抬升面 | `ToneSpec.tint` 一处定义 → `bottom` 与浮层染色同源；`SURFACE_TOKENS` + `SURFACE_RUNGS` + `PANEL_TINT` / `SURFACE_TINT`；光色变量经 `LIGHT_TOKENS` 发到 token 层；语义锚点 + 只压 `background-image` 的三层配方；交互态两族 + 框内元素 | 05-surfaces |
| 浅灰内嵌面 | `INSET_TOKENS` / `INSET_TINT`：代码块与三张停靠卡（todo / goal / queue）走独立染色通道 | 05-surfaces §4.0.2 |
| 滚动扫掠 | 见 06-run-sweep.md | 06-run-sweep |
| 装机 | `~/.dsh/profiles/web/package.json` 的 `dependencies`（`link:`）与 `dsh.profile.bundles` 各一行；profile 级 `cordis.patch.yml` **必须保持 `[]`**（往 profile patch 写 insert 会与 bundle 层重复 → `duplicate loader entry id` 启动失败） | — |

## 真机验证

* [x] 设置行出现在「外观」正下方；色调卡完整展示色调；卡面文字「默认」；8 款全部可选。
* [x] 逐款观感与对比度经真机目视确认（8 款）；浅色三款差异足够。
* [x] 四张卡恒排一行；切明暗行内容立即刷新。
* [x] 持久化：重启 dsh 后选择保留，`settings.yaml` 出现 `ui-theme-tone`。
* [x] 卸载还原：停用插件后 token / 层 / 样式表 / 设置行全部回收。
* [x] 截图存仓库根 `resources/dsh-theme-tone.png`（按 AGENTS「发布（npm 包）」：单一来源、不进 npm 包），
  README 双份以绝对 URL 引用。
* [ ] 零布局影响：开关前后 `document.body.scrollHeight` 不变。
* [ ] 交互不受影响复核：菜单、tooltip、拖拽条、输入框、弹窗；层级切分符合定案。
* [ ] 对发布执行《代码审计》；按根 AGENTS「发布（npm 包）」流程首次发布（首发须 owner 当次确认）。
