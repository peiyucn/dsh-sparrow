# DSH 插件私有 seam 特例

> 本文件只登记**当前仍欠官方的债**，三类：
> **A 私有 seam**（官方无公开能力，读写官方私有面）、**B 刻意改官方默认外观的例外**（owner 认可的观感偏离）、
> **C 静默失效风险**（靠 hashed 类名 / 本地化文案 / 固定 DOM 结构定位，官方一改即失效且没有门能拦）。
>
> **不写**公开 seam 的正常使用（公开服务 / 槽位 / 事件 / data 属性 / 导出），也不写已删除或已转公开路径的历史
> （历史查 git log）。新增条目须 owner 认可；官方补齐公开能力后删除对应条目。
> 登记对象 = `scripts/plugin-set.mjs` 的活跃插件。
>
> 跟版复核：dsh `0.2.2-rc.3`（tag `38a6a5c9`，2026-11-14）。证据与边界见
> [`docs/upstream/0.2.2-rc.3.md`](upstream/0.2.2-rc.3.md)。

## A. 私有 seam

### A1 `dsh-desk-one`（`dsh-archive-manage` 退役前同构）— WorkspaceRegistry 私有写通道

* **位置**：`src/host/sessions/archive-set.ts` 的 `mutateArchivedSet`（`enqueueOperation` + `requireState` +
  `setState`）；守卫 `src/host/sessions/gates.ts` 的 `assertRegistryMutationApi`。
* **用途**（官方 API 无法表达的四类静默维护）：
  1. 移入回收站 / 永久删除：把 id 移出归档集，但**不能**触发 `workspace/session-unarchiving`（会取消官方 worktree 清理）；
  2. 回收站还原：把 id 加回归档集，但**不能**触发 `workspace/session-archived`（会触发官方 worktree 清理）；
  3. 父子归档对齐：官方 `archiveSession` 只归档被点的会话，子会话镜像需要静默写（官方不对子会话派发后续动作）；
  4. 启动幽灵 id 清扫。
* **为什么不能走正路**：官方只提供 `archiveSession(id, { stopActivity })` / `unarchiveSession(id)`，两者都带活动门
  与后续事件派发，没有「只改归档集、不做后续动作」的公开原语。用户点归档 / 取消归档已走官方公开 API，不在本条。
* **读取走公开面**：`ctx.workspaceRegistry.archivedSessionIds`。
* **降级**：私有面缺失 → 启动自检抛错 → cordis 只停用本插件，宿主与其它插件不受影响。

### A2 `dsh-desk-one`（`dsh-archive-manage` 退役前同构）— 官方投影缓存行直读 / 失效删除 / 启动清扫

* **位置**：`src/host/sessions/projection.ts`（`readProjectionRow` / `invalidateProjectionCache` /
  `sweepStaleProjectionCache`）。
* **用途**：① 面板展示事实与空白判定读 `session_projcache` 行；② 移入回收站或永久删除后失效对应行（否则输入框
  @ 列表仍读到已删会话）；③ 启动清扫持久化里已不存在的行。
* **为什么不能走正路**：官方 `sessionProjectionCache` 服务只公开 `cachedSnapshot` / `cachedPredecessorTitle` /
  `hydratePrepared` / `write` / `coldSnapshot`，**没有删行 / 清扫 API**。域与表名取官方公开的
  `projectionCacheDomainSpec`（仅当该包无法解析时回退字面量）；冷读回填走公开 `coldSnapshot`。
* **业务约束**：回收站会话的投影行必须保留（还原后标题 / 子会话标签的唯一来源）；永久删除时由删除路由失效父 +
  子会话的行；启动清扫用 `preservedIds` 排除可还原会话。
* **降级**：读取失败按「无数据」降级（不抛穿页面）；失效校验失败重试一次并记日志，启动清扫兜底；宿主缺
  `storageDomain` 时该能力整体不启用。

## B. 刻意改官方默认外观的例外

> 均**不带**官方默认门（`data-dsh-theme-tone-plain` 只对 `backdrop.ts` / `glass.ts` 生效，本节两类在两个档位都生效）。

1. **浮层材料修正** — `plugins/dsh-theme-tone/src/surfaces.ts` 的 `buildSurfaceCss` 无条件注入：官方把少数浮层的
   面 / 字写成组件内字面量或半透明玻璃，深色玻璃上不可读 ⇒ 统一换成官方 token：
   * 左边栏 Workspace 行 hover 卡：在卡根覆盖官方 `--dsw-alias-hovercard-*`；
   * 停靠卡（todo / goal / queue）：半透明菜单玻璃 → 不透明抬升面；
   * 菜单分组标题（`[data-menu-group-heading]`）：sticky 却没有不透明底 → 用主题底 + 菜单色合成；
   * 输入框触发菜单「下面还有内容」的官方色块提示（`[data-trigger-menu]::after`）→ 改成列表内容渐隐
     （只在官方 `data-overflow-below/above` 存在时生效）。
2. **轮次导航恒显 + 内容宽度钳制** — `plugins/dsh-theme-tone/src/nav-pin.ts`：官方在 900px 隐藏轮次导航，
   owner 定案改到 700px 才停显（hover / focus 淡入）；内容宽度在**没有**官方用户宽度偏好时钳到「每侧 ≥120px、
   地板 640px」，有偏好时原样交还官方（守卫 `test/nav-pin.test.mjs`）。

## C. 静默失效风险

1. **`dsh-theme-tone` 悬停卡卡根锚点** — `src/surfaces.ts` 的
   `CARD = body > [class*='_portal'] [role='button'][aria-label]`：官方 HoverCard 的 portal 包装节点只有 hashed
   类名可辨。官方改名即 token 覆盖不命中、悬停卡退回官方深卡（不抛错、不崩）⇒ 良性降级；
   守卫 `test/surfaces.test.mjs`。
2. **`dsh-theme-tone` 轮次导航本地化 `aria-label`** — `src/nav-pin.ts` 的 `NAV_ARIA_LABELS`
   （`Turn navigation` / `轮次导航`）：官方 nav 没有 data 属性、只有本地化文案可认；官方改字即「恒显 / 窄屏浮现」
   静默失效（降级 = 窄列上轮次导航照官方消失）。建议向上游提「给该 `<nav>` 加稳定 data 属性」。
3. **`dsh-codebuddy-credits` 设置行 DOM seam** — `src/client/settings-row.ts` + `CodeBuddyProviderCard.tsx`：
   在捕获阶段拦截官方行头的「编辑」按钮（阻断官方编辑器并展开本插件编辑器），并把保存提示插到 section 顶部。
   官方改行头结构即一起静默降级：拦截不到 → 本卡不再展开（官方编辑器按原行为打开）；提示插不进 → 只是不显示
   「已保存」，Key 的保存 / 清空不受影响。
