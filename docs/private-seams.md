# DSH 插件私有 seam 特例

> 本文件**只登记"欠官方的债"**——需要 owner 认可的例外。三类：
> **A 私有 seam**（官方无公开能力）、**B 刻意改官方默认外观**、**C 无门可拦的静默失效风险**。
>
> **公开 seam 的正常使用不进本文件**：公开服务 / 公开槽位 / 公开事件 / 公开 DOM 标记 / 公开导出
> 一律视为正路，用了就用了，不写。**收缩原则**：条目应随官方补齐公开能力而**减少**——
> 官方一旦提供公开替代，就地删除条目、换用公开路径。新增条目须 owner 认可。
>
> **官方公开锚点也不在此手工维护**：权威来源是各插件 `src/` 里的选择器字面量，跟版审计时现取
> （方法与口径见 [`docs/upstream/0.2.0-rc.1.md`](upstream/0.2.0-rc.1.md) §4.1）。
> 理由：手工清单已证会漂——0.2.0-rc.1 审计时发现它漏列了三处一直在用的锚点。
>
> 最近一次核对：dsh `0.2.0-rc.1`（2026-09-29），本文件点名的例外逐条验存续，**零回归**。

---

## A. 私有 seam（官方无公开能力，启动能力检查缺失即 fail-fast）

* **`dsh-archive-manage`**
  * **`sessionPersistence.locate`** —— 后端私有方法（alpha.5 后从公开契约降级），是拿到会话**产物目录**的
    唯一途径：公开契约 `SessionPersistence` 只有 `create` / `open` / `flush` / `stat` / `list`，
    而 `stat` / `list` 返回的 `SessionPersistenceSnapshot` 只含 `header` / `revision` / `eventCount` /
    `sizeBytes`，**不含路径**；`SessionLocation`（`kind` + `path`）只出现在 `errors.ts`。
  * **WorkspaceRegistry 私有写通道**（`enqueueOperation` / `requireState` / `setState`）——
    归档集没有公开写入口。

## B. 刻意改官方默认外观的例外（**均不带官方默认门**，两个档位都生效）

> 判据：「恢复官方本该有的行为」（修 bug、复原）⇒ 不带门；「改变官方有意的设计选择」（断点、留白）⇒ 带门。
>
> ⚠️ 不带门的规则另有一条硬约束：**不得依赖插件 token 层就绪**——token 层在 `status: loading` 窗口内
> 不具备，`var()` 解析为空，比不生效更糟（悬停卡栽过一次，卡片变全透明）。

1. **悬停卡**（`HOVER_CARD_ANCHOR`）：官方把这张卡的面与字都写成组件内字面量（浅色轴下官方自己就是深卡）。
   owner：「深卡不对吧」→ 跟随主题、两个档都修。
2. **弹窗遮罩模糊**（`src/mask.ts`）：官方 0.1.7-rc.2 把 `--dsw-mask-blur` 改成 `none`（**有意为之**），
   owner 要求恢复 0.1.5 观感。证据链见 [`0.1.7-rc.2-mask-blur.md`](upstream/0.1.7-rc.2-mask-blur.md)。
3. **悬停光带跟随指针**（`dsh-nav-pin` 的 `handle-glow.ts`，**已定、待合并实施**）：官方
   `--dsh-width-handle-pointer-y` 只在**拖拽中**被写，纯悬停走 CSS 兜底 `50%`，而那个 `50%` 是相对
   `.body` 盒（官方顶栏在流内占 76px）算的 ⇒ 光带比视口中心低 38px。官方**无意的 bug**，
   owner 2026-09-29 定案「官方的也一起修复」。

⚠️ 新增破例时**必须同步更新本节计数**（曾经写着「唯一一处」，加到第二处后即失真）。
第 3 处随 `dsh-nav-pin` 并入 `dsh-theme-tone` 落地；实施时本节改为「三处」，
并顺手修 `src/surface.ts:1223` 那句已过期的「全插件**唯一**不带官方默认门的一条」（实为两条）。

## C. 静默失效风险（官方改名 / 改行为即失效，没有任何门能拦）

* **`dsh-theme-tone`** —— 仓库规矩是「不依赖 hashed CSS-module 类名」，以下三处**例外**，
  且测试**抓不到官方重命名后缀**：
  1. **悬停卡字色**（`HOVER_CARD_TEXT_TOKENS`，`src/constants.ts`）：`[class*='_hoverTitle'|'_hoverPath'|'_hoverTime'|'_hoverStatus']`
  2. **扫光带**（`SWEEP_ANCHORS`，`src/sweep.ts`）：`[class*='_row']::after` —— **已收窄**：必须同时带
     `data-variant` / `data-tool` 才命中（`test/sweep.test.mjs` 钉住不得回退）
  3. **弹窗遮罩**（`MASK_SELECTOR`，`src/mask.ts`）：`[class*='_mask']`（官方三个遮罩 `Modal` /
     `SettingsRoot` / `ImageLightbox` 只在哈希类名上可辨）
* **`dsh-codebuddy-credits`** —— 捕获阶段拦截官方行头「编辑」按钮（`stopPropagation` 阻断官方编辑器打开，
  改为展开本插件自建编辑器）：按钮保留官方原位与样式，但**官方改这个按钮即静默失效**。

## D. 已退役（历史，不再维护）

* **`dsh-vision-bridge`**（2026-09-10 退役）：曾可逆包装 `ctx.llm.resolveModelInfo` 抹除文本路由的
  image 门禁，并直读 `snapshotEvents()`。代码原地保留，本节仅作历史。
