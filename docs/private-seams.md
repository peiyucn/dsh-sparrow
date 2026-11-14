# DSH 插件私有 seam 特例

> 只登记**当前仍欠官方的债**。公开服务 / 槽位 / 事件 / data 属性的正常使用不记；历史查 git log。
> 新增条目须 owner 认可，官方补齐公开能力后删条目。
> 跟版复核：dsh `0.2.2-rc.3`（2026-11-14，tag `38a6a5c9`）。明细见 [`docs/upstream/0.2.2-rc.3.md`](upstream/0.2.2-rc.3.md)。

## A. 私有 seam（官方无公开能力）

1. **`dsh-desk-one` — WorkspaceRegistry 私有写通道**
   `src/host/sessions/archive-set.ts` 的 `mutateArchivedSet`（`enqueueOperation` + `requireState` +
   `setState`）；守卫 `gates.ts` 的 `assertRegistryMutationApi`。
   只用于官方 API 无法表达的静默维护：回收站 / 永久删除（移出归档集但不触发 `session-unarchiving`）、
   回收站还原（加回但不触发 `session-archived`）、父子归档对齐、幽灵 id 清扫。用户归档 / 取消归档走官方
   `archiveSession` / `unarchiveSession`。缺失该私有面 → 插件自停用（只停本插件）。

2. **`dsh-desk-one` — 官方投影缓存行直读 / 删行 / 清扫**
   `src/host/sessions/projection.ts`：读 `session_projcache` 行（展示事实 / 空白判定）、移入回收站 /
   永久删除后失效对应行、启动清扫陈旧行；回收站会话的行必须保留。官方服务只公开读写快照，**没有删行 /
   清扫 API**。域与表名取公开的 `projectionCacheDomainSpec`（解析不到才回退字面量）。
   读取失败按「无数据」降级，失效失败重试一次 + 启动清扫兜底。

## B. 刻意改官方默认外观（均不带官方默认门）

1. **`dsh-theme-tone` — HoverCard 材料修正**：`src/tones.ts` 的 token 覆盖层（公开
   `ctx.theme.overrideTokens`）把官方「深底白字」的 `--dsw-alias-hovercard-*` 全局换成主题抬升面 +
   官方 label 阶梯，让悬停卡跟随主题。
2. **`dsh-theme-tone` — 其他浮层材料修正**：`src/surfaces.ts` 停靠卡（todo / goal / queue）换不透明
   抬升面；菜单分组标题补不透明底；输入框触发菜单的官方色块提示改成列表内容渐隐。
3. **`dsh-theme-tone` — 轮次导航恒显 + 内容宽度钳制**：`src/nav-pin.ts` 把官方 900px 隐藏改成 700px
   才停显（hover / focus 淡入）；没有官方用户宽度偏好时内容宽度钳到「每侧 ≥120px、地板 640px」，
   有偏好时原样交还官方。

## C. 静默失效风险（官方改名 / 改结构即失效，没有门能拦）

1. **`dsh-codebuddy-credits` 设置行 DOM seam**：`src/client/settings-row.ts` + `CodeBuddyProviderCard.tsx`
   在捕获阶段拦截官方行头的「编辑」按钮（阻断官方编辑器、展开本插件编辑器），并把保存提示插到 section 顶部。
   官方改行头结构即静默降级：拦截不到 → 本卡不再展开（官方编辑器按原行为打开）；提示插不进 → 只是不显示
   「已保存」，Key 的保存 / 清空不受影响。
