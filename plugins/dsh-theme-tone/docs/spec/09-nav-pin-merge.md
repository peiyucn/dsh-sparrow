# 09 · nav-pin 合并 — dsh-theme-tone

> **状态：待评审**（按仓库 AGENTS「新功能先写 spec，评审后才开工」）。
> 落地时机与 dsh 0.2.0 跟版**同一次改动**完成，见 §8。
> 上游决策由 owner 于 2026-09-29 分三次拍板，见 §1。

---

## §1 决策与理由（owner 拍板，五条）

| # | 决策 | 理由 |
| :--- | :--- | :--- |
| 1 | **`dsh-nav-pin` 并入 `dsh-theme-tone`** | 插件太小；本质是**适应性改造**（跟着官方几何/断点调整）；界面优化类今后统一归 theme-tone；不想插件数量持续膨胀（对用户不友好） |
| 2 | **版本号继续精确匹配**（不设范围窗口） | 官方自己**已发布**的插件就是这么做的（`@deepseek-ai/dsh-browser-use@0.1.7-rc.2` 的 peer 是 `dsh-brand = 0.1.7-rc.2` 精确号；`playwright-mcp` 四个 `dsh-*` 全精确）。只有不进版本门的 `@deepseek-ai/cordis` 用 `~4.0.4` |
| 3 | **navpin 规则进门**：合并后受 theme-tone 的色调门管，官方默认档下窄屏修复不生效 | 见下方「总原则」 |
| 4 | **`plugins/dsh-nav-pin/` 原地保留、不删不移** | 跟 `dsh-vision-bridge` 退役先例，保持退役程序一致（处置动作见 §4） |
| 5 | **`handle-glow`（修官方悬停光带偏位）不带色调门**，两个档位都生效 | owner：「官方的也一起修复下」——官方是无意的 bug，属于"恢复官方本该有的行为"，与已备案的弹窗虚化同类（判据见 §3.1） |

> **术语**：本文的「门」有三种，别混——**版本门**（官方装的，判 peer 版本，不过就整包跳过）、**色调门**（我们装的 CSS 门 `body:not([data-dsh-theme-tone-plain])`，不过就规则不命中）、**能力门**（我们装的 `apply` 自检，不过就惰性停用）。决策 3 与决策 5 指的都是**色调门**。

**总原则（owner 2026-09-29，贯穿以上三条）**：

> dsh 仍在快速发展期，**每次版本变化都不是"换个版本号继续活下去"这么简单**。

这条原则就是仓库 AGENTS 已有的口径——「dsh 升级 = 正式适配任务：release note → 影响清单 → bump 依赖 → typecheck → 修 → verify → 发新版」。它同时否掉了两种省事做法：

* **不接受"白捡存活"**：navpin 此前靠"零声明"（peer 里只有 `@deepseek-ai/cordis`，而判定只认 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*`）在每次官方发版时自动幸免。这是漏考，不是健壮性，合并后自然消失。
* **不设范围窗口**：窗口会把"没验过的版本"悄悄放进来，与"每次跟版都要真适配"相冲突。

> 版本门机制与判定的完整实测记录（含候选范围的 semver 行为）见 `docs/upstream/0.2.0-rc.1-compatibility-gate.md`（待补，与跟版任务一并落地）。

## §2 合并后的契约（一句话）

> **选了色调 → 色调 + 对话区布局优化一起生效；官方默认档 → 一切不动（与停用插件逐像素一致）。**

这条扩写了本插件的定位：从「明暗主题之下的**色调层**」→「**对话区观感 + 布局优化层**」。`package.json` 的 `description`、README 双份、仓库 AGENTS 第 1 章的功能清单同步改（否则违反「文档对齐」审计条目）。

**已知并接受的后果**：官方默认档下，≤900px 轮次导航仍按官方规则消失，拖拽条留白仍是官方 88px。要用上这些必须选任一色调。

## §3 设计决策

### 3.1 navpin 四段规则全部进门，不设例外通道

navpin 的四段生成规则全部并入 theme-tone 的**门内**生成路径：

| 段 | 内容 | 进门后 |
| :--- | :--- | :--- |
| 恒显 | 压过官方 `@container (max-width: 900px) { display: none }` | 带 `body:not([plain])` 前缀 |
| 浮现 | ≤700px 默认 opacity 0，hover / `:focus-within` 淡入 + `::before` 命中区 | 同上 |
| 宽度钳制 | 每侧留白 88 → 120px，地板 640px，同步重算卡片宽度 | 同上 |
| reduced-motion | 关掉 opacity 过渡 | 同上 |

⚠️ **`display: block` 那条也必须带门**——它是"改官方断点"的核心动作，漏掉它等于官方默认档也被改了，契约当场作废。

**门的判据**（写清楚是为了防止后人把例外误判成随手为之）：

> **"恢复官方本该有的行为"（修 bug、复原）→ 不带门，两个档都生效；"改变官方有意的设计选择"（断点、留白）→ 带门。**

| 规则 | 官方态度 | 我方动作 | 门 |
| :--- | :--- | :--- | :--- |
| 悬停卡（`src/surface.ts:1226`） | 把面与字写成组件内字面量 | 掰回主题（owner：**先把官方默认修了**） | **不带**（既有破例 1） |
| 弹窗遮罩虚化（`src/mask.ts`） | **有意**改掉（`0.1.7-rc.2` 把 `--dsw-mask-blur` 改成 `none`，注释重写 + e2e 钉住） | 恢复 `blur(2px)`（owner 定案两个档位都恢复） | **不带**（既有破例 2） |
| **navpin 悬停光带修复** | **无意的 bug**（`--dsh-width-handle-pointer-y` 只在拖拽中被写） | 补写官方漏掉的取值 | **不带**（决策 5，破例 3） |
| navpin 断点 / 宽度钳制 | **有意**的 900px 隐藏与 88px 留白 | 有意**改**官方策略 | **带**（决策 3） |

⚠️ **不带门的规则有一条硬约束：不得依赖插件 token 层就绪。** token 层在 `status: loading` 窗口内（以及 `overrideTokens` 抛错重试成功之前）是**不具备**的，`var()` 会解析为空 —— 比不生效更糟（悬停卡栽过一次，卡片变全透明，兜底办法见 `src/surface.ts:1227-1236`）。三条不带门的规则都满足：悬停卡带官方兜底值、弹窗虚化只设一个 CSS 变量、handle-glow 只用 JS 写官方变量、不读任何 CSS 变量。

⚠️ **既有文档不一致（本次一并修）**：`src/surface.ts:1223` 现在写着「这是全插件**唯一**不带官方默认门的一条」——该表述在弹窗虚化加入后**已过期**（实际两条），加 handle-glow 后为**三条**；`00-overview.md` 的「刻意改官方默认的破例共两处」同步改成**三处**并逐个点名。

### 3.2 能力门合并成一条，`:has()` 与 `@container` 都不门

* 门保持 theme-tone 现有那一条：`src/client/index.ts` 的 `warnMissingCapabilities` + `src/backdrop.ts` 的 `REQUIRED_CSS_FEATURES`。**不新增门项**。
* **`:has()` 不门**：沿用 theme-tone 既有决策（`src/backdrop.ts:226-229` 已写明理由：缺失只是几条锚点规则不命中、那些面退回官方外观，不该为它停掉整个色调）。navpin 的选择器大量使用 `:has()`，结论相同。
* **`@container` 不门**：这是 navpin 带进 theme-tone 的**第一处** `@container`（现用量 0）。引擎不支持时整块被解析器丢弃 → 退化回官方 900px 行为，属"少覆盖"而非"插件失效"，判据与 `:has()` 同。
* **由此产生的姿态变化（有意）**：navpin 原来是"缺 `:has()` 就整张样式表不注入 + 告警"；合并后变成"规则静默不命中"。**只影响老引擎，dsh Web 只跑 Chromium，正常环境无差别。**
* navpin 的 `src/compat.ts`（与 theme-tone 那份近乎逐字重复，且 theme-tone 那份是超集）与 `REQUIRED_CSS_FEATURES`（两条探针）**随之删除**。

### 3.3 与玻璃的既存缝：合并后变成包内不变式

这条缝本来就存在，只是过去活在两个包的注释里：

* `src/glass.ts:812-832`：顶栏被浮层化后 `.body` 从 y=0 起，给 `[data-width-handle]` 补 `top: 76px`（`HEADER_HEIGHT_PX`）还原官方几何，**注释点名 nav-pin**；
* `src/handle-glow.ts`：读**实时矩形**补写 `--dsh-width-handle-pointer-y`，**故意布局无关**，就是为了不管顶栏是否浮层。
* 本条**不带色调门**（决策 5）：官方默认档下 theme-tone 不碰任何几何（`glass.ts:830` 那条只在色调档生效），而 handle-glow 读的是实时矩形，两种几何下都算得对——这正是当初否决纯 CSS 修法（`handle-glow.ts:31-35`）的原因。
* **常驻开销**：新增一个 document 级**被动** `pointermove` 监听（早退路径只做一次 `closest()`，绝大多数移动在此返回）；无定时器，`requestAnimationFrame` 只在指针真的落在拖拽条上时排一帧。theme-tone 的「低常驻开销」验收条目要补记这一条，真机 P95 帧时间与 navpin 现状对比。

合并后要**新增一条守卫测试**：navpin 侧**不得**硬编码 `76px`（必须走 `getBoundingClientRect()`），theme-tone 侧的 `HEADER_HEIGHT_PX` 仍是几何唯一真值。两者对 `[data-width-handle]` 的几何前提必须一致。

### 3.4 client 入口面：不新增任何 `inject` 项

* theme-tone 现有 `inject = ['theme', 'slots', 'locale']`，设置读取面走 `ctx.inject(['configForms'], …)` 可选 fork —— **保持不动**；
* navpin 是 `inject: []` —— 合并后**不新增任何 `inject` 项**。这是硬约束：往 `inject` 里塞服务等于拿宿主启动冒险（客户端 boot 审计把 `pending` 也当致命失败）；
* `package.json` 的 `dsh.client.inject` 保持 theme-tone 现有 4 项不变。

### 3.5 样式注入通道：并入 theme-tone 现有那一张表

* navpin 现在单开 `style[data-dsh-nav-pin]` 并按该属性去重；合并后**并入 theme-tone 现有的 style 元素**（`src/client/index.ts` 的 `ensureThemeStyles` 一带），不再单开 style，也不再使用 `data-dsh-nav-pin` 标记；
* 卸载清理沿用 theme-tone 现有 `ctx.effect` 纪律；
* navpin 的 `ensureNavPinStyles` / `followHandleGlow` 两个函数体迁入 theme-tone 的 client 入口（保留原有的 rAF 合帧、passive 监听、`try/catch` 不冒泡等实现细节与注释）。

## §4 搬迁清单

| 源（`plugins/dsh-nav-pin/`） | 去向 | 处理 |
| :--- | :--- | :--- |
| `src/nav-pin.ts` | `plugins/dsh-theme-tone/src/nav-pin.ts` | 整体搬迁；`buildNavPinCss()` 产出并入门内生成路径（§3.1） |
| `src/handle-glow.ts` | `plugins/dsh-theme-tone/src/handle-glow.ts` | 整体搬迁，实现不变 |
| `src/compat.ts` | — | **删除**（theme-tone 的 `src/compat.ts` 是超集） |
| `src/host.ts` / `src/index.ts` | — | **删除**（入口归 theme-tone） |
| `src/client/index.ts` | 并入 `theme-tone/src/client/index.ts` | 搬两个函数体 + 调用点，不新建入口 |
| `cordis.patch.yml` | — | **删除**（用 theme-tone 的） |
| `scripts/bundle-client.mjs` | — | **删除**（theme-tone 已有） |
| `test/nav-pin.test.mjs`、`test/handle-glow.test.mjs` | `theme-tone/test/` 同名文件 | 整体搬迁；`nav-pin.test.mjs` 补「**带门**」断言（§3.1），`handle-glow.test.mjs` 补「**不带门** + 不硬编码 76」断言（决策 5、§3.3） |
| `test/compat.test.mjs` | 并入 `theme-tone/test/compat.test.mjs` | 去重后合并 |
| `test/structure.test.mjs` | 并入 `theme-tone/test/structure.test.mjs` | 保留「client half 不得抛错」那条守卫的等价形式；删掉 navpin 专属的 files / patch 断言 |
| `docs/spec/00-overview.md`、`01-design.md`、`02-roadmap.md` | 内容并入本文件与 theme-tone 现有 spec 体系 | 并入后删除（NAV 选择器查证结论、宽度轴公式、`:has()` 特异性等值钱的结论必须留下） |
| `README.md` / `README.zh-CN.md` | — | 改为"**已并入 dsh-theme-tone，请卸载本插件**"（对照 vision-bridge 退役先例，中英双份） |
| `CHANGELOG.md` / `CHANGELOG.zh-CN.md` | — | 追加一条退役说明 |
| 整目录 | **原地保留**（不删不移，决策 4） | ① 加进 `scripts/verify-all.mjs` 的 `RETIRED_PLUGINS`（此后不进 verify）；② README 双份标注退役；③ npm deprecate（owner 本机手动）。对照 `dsh-vision-bridge` 先例 |

**theme-tone 侧需要新增的测试**：

1. navpin 四段规则**全部带门**（逐段断言 `body:not([plain])` 前缀，防止漏掉 `display: block` 那条）；
2. 官方默认档下**不产出**任何 navpin 规则；
3. `handle-glow` 侧不得出现硬编码 `76`（§3.3）；
4. zh / en 两套 `aria-label` 都覆盖。

**theme-tone 侧需要一并修正的既有不一致**（顺手做，属「文档对齐」审计条目）：

1. `src/surface.ts:1223` 的「这是全插件**唯一**不带官方默认门的一条」→ 改为"三条之一"，并指向 §3.1 的判据表；
2. `docs/spec/00-overview.md` 的「刻意改官方默认的破例共两处」→ 改成**三处**并逐个点名（悬停卡 / 弹窗虚化 / 悬停光带）。

## §5 影响面

* **theme-tone**：新增功能 → minor 位。具体版本号与 0.2.0 跟版一并定（现行 `0.1.5-rc.2`，官方 `0.2.0-rc.1`；按仓库「版本线镜像官方 dsh」口径）。
* **`@dsh-sparrow/dsh-nav-pin`**：npm 上已有 7 个版本（`latest = 0.1.5-rc.2`）→ 退役走 **deprecate**（不 unpublish；owner 本机手动执行，按 AGENTS「坏版本处置」）。
* **profile**：`~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 与 `dependencies` 各移除一行 —— **必须最后一步做**，见 §8。
* **仓库 AGENTS**：第 1 章功能清单改一行（navpin 移入 theme-tone 条目；退役插件变两个）。

## §6 验收标准

**官方默认档（新增，最关键）**

* 开关 theme-tone 前后，**除已备案的三处破例外**逐像素一致；轮次导航行为回到官方 900px 断点；拖拽条留白 88px。
  三处破例 = 悬停卡（`src/surface.ts`）、弹窗遮罩虚化（`src/mask.ts`）、悬停光带跟随指针（§3.3）。
* **悬停光带在两个档位都跟随指针**（官方默认档下不再停在官方偏位 `398`）；按住拖动时由官方接管、无跳变（决策 5）。
* 页面上不存在任何 navpin 规则（可读 `document.styleSheets` 断言）。

**选中任一色调**

* 对话列 700–900px：轮次导航可见（官方此时默认隐藏）。
* 对话列 ≤700px：默认不可见，hover 右侧轨道约 120ms 浮现为浮层，移出隐藏；键盘 `Tab` 进入（`:focus-within`）同样浮现；浮层无框无底色。
* 浮层显示期间对话内容布局不变（零高度锚点 + 绝对定位）。
* 宽度钳制：宽列拖到最宽时内容右缘留 ≥120px；窄列内容压到 640px 地板；输入卡片同宽轴收缩。
* `prefers-reduced-motion: reduce` 下无过渡动画。
* zh / en 两套界面语言均生效。

**合并本身**

* **摘除 navpin 之后以上全部仍成立** —— 这是"合并成功"的唯一判定。
* 卸载 theme-tone 后，导航行为（含 navpin 部分）一并回到官方。
* 沿用 theme-tone 既有验收：零布局影响（`document.body.scrollHeight` 不变）、卸载即还原、低常驻开销。

## §7 待决项

**无。** 第五条决策（handle-glow 不带门、两个档位都修）已定，本 spec 待评审通过即可开工。

## §8 执行顺序（与 0.2.0 跟版合成一次改动）

按根 AGENTS 与仓库 AGENTS 的「dsh 升级 = 正式适配任务」：

1. **官方 0.2.0-rc.1 release note → 影响清单**（含本次已查实的结论：绝大多数官方包只改了版本号，`dsh-session` 仅新增一个导出 `ToolCallRecovery`，`dsh-settings` 只加测试，`dsh-llm-deepseek` 只动内部文件存储；五个插件实际 import 的全部运行时符号在 0.2.0-rc.1 中仍然存在）。
2. **bump 精确版本**：五个插件的 `peerDependencies` / `devDependencies` → `0.2.0-rc.1`；`pnpm-workspace.yaml` 的 `overrides` 闭包与 `minimumReleaseAgeExclude` 按 0.2.0-rc.1 的 manifests 重算；`pnpm-lock.yaml` 重算并确认零旧版本残留。
3. **typecheck → 修**。
4. **本次合并的代码改动**（§3 设计 + §4 搬迁 + 新增测试）。
5. **逐插件 verify**（typecheck + build + client bundle + test + `npm pack --dry-run`）。
6. **隔离实例验证**：独立 `DSH_HOME` + 独立端口启动，**日志零 `skipping profile bundle` / 零 `disabling profile plugin row`**；真机按 §6 两档逐条验。
7. **摘除 navpin**（profile 的 `bundles` + `dependencies` 各一行）→ 重启 → **再验一遍 §6**。
8. **版本号 + CHANGELOG 双份 + README 双份**（theme-tone 记新功能；navpin 记退役）。
9. **发布**：按「发布（npm 包）」流程，**push tag 前须 owner 当次点头**。

> 过渡期安全性：第 4 步完成后，navpin 仍作为独立 bundle 在跑（它不受 theme-tone 影响），所以 **6 → 7 之间没有任何功能空窗**。两者同时存在时的叠加行为：
> * **布局规则**两份并存，但 navpin 那份不带门、theme-tone 那份带门 → 官方默认档下的表现与摘除前**一致**（都由 navpin 那份生效）；
> * **悬停光带**两边都会写同一个官方变量、算出的值相同 → **幂等**，无冲突。
> 因此过渡期不会出现"突然变了"。

## §9 后续（本次范围之外，另行跟进）

* **跟版检查脚本**：把"五个插件的精确 pin 必须等于单一真值"做成 `scripts/check-dsh-pin.mjs`，挂在根 `verify` 第一步（与 `check-no-local-paths.mjs` 并列），防止 pin 腐化成"多个不同版本"（现 `dsh-vision-bridge` 仍钉在 `0.1.5-rc.1`，虽已退役不进 verify）。
* **客户端半边的混版隐患**：`dsh.client.inject` 里的 `@deepseek-ai/dsh-client-*` **不参与版本门**，却会被 esbuild 内联进 `lib/client.js`（external 白名单只有 react 系 + cordis + store + slots + primitives）。是否 external 化或另加一道客户端格式门，单独评估。
* **`compatibility.json` 应急通道**：跟版尚未完成、但需要临时恢复时，可用 `dsh plugin --profile web allow-version <包@版本> --dsh-version 0.2.0-rc.1 --accept-risk`。属应急手段，不替代跟版。
