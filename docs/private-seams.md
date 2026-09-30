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

## C. 官方缺陷（**我们不修**，仅登记以免被反复当成我们的 bug 重查）

* **会话中列裁切顶栏里的弹出层**（owner 报「顶栏的后台任务弹窗被右侧栏压住」，2026-10-01 查证）：
  中列那三层 `[data-phase]` / `.centerCol` / `.frame` 都是 `overflow: hidden`
  （`ConversationRoot.module.css:363-365` 等），**裁切右边界逐像素等于右栏面板左缘**
  （实测 1600×900 下 centerCol 右缘 880 = 面板左缘 880）。顶栏那个「后台任务」弹出层
  锚在顶栏动作区（盒子 280..880）里、向右伸出面板 225px，伸出的部分**整块被裁掉**。
  **官方默认档（本插件门关掉）逐像素同样裁** ⇒ 与本插件无关。
  可修但要动官方列几何（把裁切打开或把弹出层 portal 出去），收益 < 风险，**不修**。
  与之相邻的**层序**那半我们已核过是**对的**、且**不该改**：顶栏盒子与面板盒子几何不相交
  （880 | 880，重叠 0），两者在真实 app 里从不争同一像素；而把顶栏抬到面板之上会违反官方次序
  —— 官方全屏面板 `--dsh-dockkit-dock-layer: 40` 高于顶栏 9
  （`SidebarRight.module.css:19-21,64-66`，原话「fullscreen (40) covers the frame and remains
  below independently floating panels (60)」），dockkit 浮窗又是 60 —— 三者都必须能压住顶栏。
  守卫钉在 `test/glass.test.mjs`「顶栏不得抬到右栏面板之上」那条。

## D. 静默失效风险（官方改名 / 改行为即失效，没有任何门能拦）

* **`dsh-theme-tone`** —— 仓库规矩是「不依赖 hashed CSS-module 类名」，以下四处**例外**，
  且测试**抓不到官方重命名后缀**：
  1. **悬停卡字色**（`HOVER_CARD_TEXT_TOKENS`，`src/constants.ts`）：`[class*='_hoverTitle'|'_hoverPath'|'_hoverTime'|'_hoverStatus']`
  2. **扫光带**（`SWEEP_ANCHORS`，`src/sweep.ts`）：`[class*='_row']::after` —— **已收窄**：必须同时带
     `data-variant` / `data-tool` 才命中（`test/sweep.test.mjs` 钉住不得回退）
  3. **弹窗遮罩**（`MASK_SELECTOR`，`src/mask.ts`）：`[class*='_mask']`（官方三个遮罩 `Modal` /
     `SettingsRoot` / `ImageLightbox` 只在哈希类名上可辨）
  4. **桌面端标题栏 overlay**（`src/caption.ts`）：`body > span[style*='--dsw-specific-sidebar-fill'][style*='--dsw-alias-label-primary']`
     —— 官方那条 Windows preload 探针（`apps/desktop/src/preload-windows.ts`）没有 data 属性，
     唯一可辨的是它 inline style 里逐字写着的两个 token 名；**两者同时出现 + `body` 直接子**双重收窄
     （`test/caption.test.mjs` 钉住）。命中后把探针**自己**那个 token 设为 `transparent`，
     让官方 WCO overlay 透明、由本插件铺满视口的装饰层透上来。官方改写那一行即**不命中**，
     退回改前外观（不透明 overlay），属良性降级。
     ⚠️ 本条**刻意不带**官方默认门：官方那套 `MutationObserver` 只 observe
     `root[lang]` / `body[data-ds-dark-theme,style]` / `head`，**不观察本插件的门属性** ——
     带门则门翻开时不重发、overlay 停在旧色（实测），是不留痕迹的失效；
     而不带门在颜色上恒等（探针与官方 `.frame::before` 读的是**同一个** token，必然同值）。

* **`dsh-codebuddy-credits`** —— 捕获阶段拦截官方行头「编辑」按钮（`stopPropagation` 阻断官方编辑器打开，
  改为展开本插件自建编辑器）：按钮保留官方原位与样式，但**官方改这个按钮即静默失效**。

## E. 已退役（历史，不再维护）

* **`dsh-vision-bridge`**（2026-09-10 退役）：曾可逆包装 `ctx.llm.resolveModelInfo` 抹除文本路由的
  image 门禁，并直读 `snapshotEvents()`。代码原地保留，本节仅作历史。
