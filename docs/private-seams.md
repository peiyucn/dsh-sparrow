# DSH 插件私有 seam 特例

> **2026-10-27 全量重写（dsh-theme-tone）**：该插件已按「颜色 + 地面光 + 三块玻璃」四件事重写，
> 旧实现里的私有 seam 与破例**全部退出**：`src/mask.ts`（遮罩模糊恢复）、`src/popover.ts`（弹层列内夹取）、
> `src/handle-glow.ts`（拖拽条光带跟随）、`src/sweep.ts`（扫光带）、`src/caption.ts`（桌面标题栏 overlay）、
> `src/surface.ts`（浮层光层与悬停卡字色）、`src/anchors.ts`（运行期锚点扫描）、`src/phase.ts`（视口相位测量）
> 均已删除。当前 theme-tone **无私有 seam（§A）**；左边栏 Workspace hover 卡的牌面修复已不再依赖官方
> CSS-module 类名后缀（`_hoverTitle` 等），改为在卡根覆盖官方 `--dsw-alias-hovercard-*` 设计 token，
> 但**卡根元素本身仍只能按官方 portal 包装节点的 hashed 类名定位**（`_portal`，见 §D）。
> 其余只用 `ctx.theme` 的 token 覆盖通道与官方公开 data 属性。

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
> 最近一次跟版复核：dsh **`0.2.2-rc.3`**（tag `38a6a5c9`，2026-11-14；官方 source 与当前插件源码逐条对照）。
> 本轮结果：§A 原四条里 **1 条已删除**（`sessionPersistence.locate` 私有依赖 → 改用公开
> `snapshot.location`，代码已切换，见 §E）、**1 条已部分收缩**（投影缓存域已改用官方
> `projectionCacheDomainSpec`）、**1 条形参分派已成死代码**（`fn.length`，收缩项）、
> **1 条收缩为仅静默维护**（用户归档/取消归档已转官方公开 API，私有写只剩回收站/删除/还原/对齐）；
> §B 收敛为**两组**；原 §C 的官方缺陷**上游已修**（删除本节）；
> §D 只保留 **3 条**真实静默风险。收缩明细见 §E；证据与边界见
> [`docs/upstream/0.2.2-rc.3.md`](upstream/0.2.2-rc.3.md)。

---

## A. 私有 seam（官方无公开能力，启动能力检查缺失即 fail-fast）

> 登记对象 = `dsh-desk-one` 的 host half（`plugins/dsh-desk-one/src/host/sessions/`）；仍在仓库内的
> `dsh-archive-manage`（`plugins/dsh-archive-manage/src/host/`）是同构实现，退役前两者共用同一套 seam
> （其 `sessionPersistence.locate` 调用随退役一并删除，见 §E）。两边的能力门与私有面守卫见各自的
> `host/.../gates.ts`。

* **WorkspaceRegistry 私有写通道（`enqueueOperation` / `requireState` / `setState`）—— 仅剩静默维护（结构性必需）**
  * **用户归档 / 取消归档已转正路**（2026-11-14）：`/api/desk-one/sessions/archive|unarchive` 直接委托官方
    公开 API `ctx.workspaceRegistry.archiveSession(id)` / `unarchiveSession(id)`
    （`archive-set.ts` 的 `archiveSession` / `unarchiveSession`）；活动门、pin 摘除、持久化与后续动作
    `workspace/session-archived` / `session-unarchiving`（rc.2+ worktree 清理据此生效）全部由官方负责。
    官方活动门拒绝被映射为用户可读的 409 `SESSION_ACTIVE`（提示先停止生成），未知会话映射 404。
    `stopActivity`（停止并归档）尚未接入 Desk One UI，保持官方默认的「拒绝活动会话」语义。
  * 私有写链（`mutateArchivedSet`）现在只服务官方 API **无法表达**的静默维护：
    ① 移入回收站 / 彻底删除（把 id 移出归档集，但不触发 unarchive 后续动作、不做活动检查）；
    ② 回收站还原（把 id 加回归档集，但不触发 archive 后续动作）；
    ③ 父子归档对齐（idempotent 镜像；官方不对子会话派发归档后续动作）；
    ④ 启动幽灵 id 清扫。
    官方只提供「带后续动作 + 活动门」的写入口，没有「只改归档集」的公开原语——这是本条无法整体转正路的
    结构性原因（可向上游提 API 需求）。
  * 守卫：`src/host/sessions/gates.ts` 的 `assertRegistryMutationApi`（缺私有面即自停用）。
    读取仍走公开 getter `ctx.workspaceRegistry.archivedSessionIds`（`readArchivedIds`）。
  * 子树语义：归档委托官方单会话写入后，子会话由 ③ 的对齐在 `domain/changed` 后异步补齐（不再是一次
    `setState` 原子写）；官方对子会话本身也不派发归档后续动作，行为与官方一致。

* **`session_projcache` 存储域直读 / 直删 / 启动清扫 —— 已收缩一半，剩余仍需要**
  * **已收缩**（2026-11-14 复核确认代码已改）：域/表名优先取官方公开 `projectionCacheDomainSpec`
    （rc.3 导出：`packages/session/session-projection-cache/src/index.ts:60`；插件
    `src/host/sessions/projection.ts:28-35` 动态 import，`src/host/sessions/constants.ts:65-95`
    只在该包无法解析时回退字面量）；冷读回填走官方公开 `coldSnapshot`
    （`projection.ts:120-136`，调用点 `projection-seed.ts`）。**旧文本的「待办：换成 import 官方 spec」已完成，删。**
  * **剩余私有部分**：投影行的**读取 / 失效删除 / 启动清扫**仍直读 storage-domain
    （`projection.ts:171-177` 读、`:190-215` `delete`、`:231-252` 遍历 `keys()` 清扫）——官方服务只公开
    `cachedSnapshot` / `cachedPredecessorTitle` / `hydratePrepared` / `write` / `coldSnapshot`，
    **没有删行 / 清扫 API**（`session-projection-cache/src/index.ts:162,187,223,257,288`）。
  * 业务约束（保留）：回收站会话的投影行必须保留（还原后标题 / 子会话标签的唯一来源），永久删除时由
    删除路由失效父 + 子会话的行；启动清扫已用 `preservedIds` 排除可还原会话。

* **`ctx.get('sessionProjections')` / `ctx.get('sessionProjectionCache')` + `fn.length` 形参自适应
  —— 仍需要，但形参分派已成死代码（收缩项）**
  * 现状：desk-one `src/host/sessions/projection.ts:88-105` 是 `cachedSnapshot` 读取的**唯一入口**
    （标题 / 子会话标签 / 行回填三处共用；`fn.length >= 3` 走旧签名），`:120-136` `coldSnapshot`
    形参不足即放弃回填，`:164-168` 同款判断；`summaryBlockOf` 经 `ctx.get('sessionProjections')`
    取 `summaryKeys()`（`:147-162`）。
  * **rc.3 实测签名已固定**：`cachedSnapshot(meta, keys?)`（2 参，
    `session-projection-cache/src/index.ts:162`）、`coldSnapshot(meta, inheritedEventCount, events)`
    （3 参，同文件 `:288`）、注册表 `summaryKeys()`（`session-projection/src/index.ts:570`）
    ⇒ 3 参 `cachedSnapshot` 分支与「形参不足放弃回填」永远走不到。
  * **收缩提案（只进报告，不改代码）**：删 `fn.length` 分派，直接按 rc.3 签名调用（保留 try/catch 与
    fail-soft 语义并同步简化 `canWriteProjectionCache` 守卫）。改完本条只剩「字符串取服务」的半个欠账；
    彻底去掉需把两个服务纳入依赖声明，收益是可读性，需 owner 权衡。

## B. 刻意改官方默认外观的例外（**均不带官方默认门**，两个档位都生效）

> 判据：「恢复官方本该有的行为」（修 bug、复原）⇒ 不带门；「改变官方有意的设计选择」⇒ 带门
> （本插件用 `data-dsh-theme-tone-plain` 表达「官方默认」档，只对 `backdrop.ts` / `glass.ts` 生效）。
> 2026-11-14 复核：不带门的只有下面**两组**；旧文本的「三处 / 四条」计数以及 `src/mask.ts`（遮罩模糊）、
> `src/handle-glow.ts`（悬停光带）两条已随 2026-10-27 重写删除，一并删除。

1. **浮层材料修正**（`plugins/dsh-theme-tone/src/surfaces.ts`，`buildSurfaceCss` 无条件注入）：
   官方把少数浮层的面 / 字写成组件内字面量或半透明玻璃，深色玻璃上不可读 ⇒ 统一换成官方 token：
   * 左边栏 Workspace 行 hover 卡：在卡根覆盖官方 `--dsw-alias-hovercard-*`（官方 rc.3 起改吃这组
     token：`packages/client/ui-primitives/src/HoverCard.module.css:16,36`；标签行见
     `ui-workspace/src/client/rows/Rows.module.css:420-443`）；
   * 停靠卡（todo / goal / queue）：半透明菜单玻璃 → 不透明抬升面；
   * 菜单分组标题（`[data-menu-group-heading]`，官方 rc.3 仍在 `ui-primitives/src/MenuGroup.tsx:15`）：
     sticky 却没有不透明底 → 用主题底 + 菜单色合成；
   * 输入框触发菜单「下面还有内容」的官角色块提示（`[data-trigger-menu]::after`）→ 改成列表内容渐隐
     （只在官方 `data-overflow-below/above` 存在时生效）。
2. **轮次导航恒显 + 内容宽度钳制**（`plugins/dsh-theme-tone/src/nav-pin.ts`，自 `dsh-nav-pin` 并入）：
   官方在 900px 隐藏轮次导航；owner 定案改到 700px 才停显（hover / focus 淡入）；内容宽度在**没有**
   官方用户宽度偏好时钳到「每侧 ≥120px、地板 640px」，有偏好时原样交还官方（守卫
   `test/nav-pin.test.mjs:38` 明示这组规则不带门）。

## C. 官方缺陷（我们不修，仅登记）

> 2026-11-14 复核：原登记的「会话中列裁切 / 遮盖顶栏里的弹出层（`JobListAction`）」**上游已修**——
> rc.3 `packages/client/ui-jobs/src/client/JobListAction.tsx:596` 用 `createPortal` 把弹层挂到 body
> 并改用 CSS anchor（`rc.1` tag 即已有、`rc.3` 仍在），本插件也已没有对应缓解代码。
> 本节当前**暂无条目**；官方层叠次序相关的历史约束见 §E。

## D. 静默失效风险（官方改名 / 改行为即失效，没有任何门能拦）

* **`dsh-theme-tone` 悬停卡卡根锚点**（`src/surfaces.ts:13`
  `CARD = body > [class*='_portal'] [role='button'][aria-label]`）：官方 HoverCard 的 portal 包装节点
  （rc.3 `ui-primitives/src/HoverCard.module.css:95` `.portal { display: contents }`；
  可复制卡根带 `role='button'` + `aria-label`：`HoverCard.tsx:283-292`）**只有 hashed 类名可辨**。
  这是 theme-tone **唯一剩下的 hashed 类名依赖**（字色已改官方 token）。官方改名即 token 覆盖不命中、
  悬停卡退回官方深卡（不抛错、不崩）⇒ 良性降级。守卫：`test/surfaces.test.mjs:10,14-22`。
* **`dsh-theme-tone` 轮次导航 `nav` 的本地化 `aria-label`**（`src/nav-pin.ts:8`
  `NAV_ARIA_LABELS = ['Turn navigation', '轮次导航']`）：官方 nav 没有 data 属性、只有 `aria-label`
  （rc.3 `ui-chat/src/client/chat/TurnNavigator.tsx:235-237`），只能按文案认；官方改字即「恒显 / 窄屏浮现」
  静默失效（降级 = 窄列上轮次导航照官方消失）。建议向上游提「给该 `<nav>` 加稳定 data 属性」。
* **`dsh-codebuddy-credits` 设置行 DOM seam**（`src/client/settings-row.ts` 全文；官方结构：
  `ui-settings-models/src/client/ModelsSection.tsx:464-508`，`li > div.rowHead > span.rowActions > 第一个 button(编辑)`）：
  本卡在**捕获阶段**拦截官方行头「编辑」按钮（`CodeBuddyProviderCard.tsx:134-143`，`stopPropagation`
  阻断官方编辑器并展开自建编辑器），并用 `insertSavedNotice` 把绿色保存提示插到 section 顶部、
  用本插件样式隐藏官方占位编辑器（`styles.ts:194-245`）。官方改行头结构即三处一起静默降级：
  捕获不到「编辑」→ 本卡不再展开（官方编辑器按原行为打开，按钮位置 / 样式始终是官方的）；
  提示插不进去 → 只是不显示「已保存」，Key 的保存 / 清空不受影响。

## E. 已退役 / 已收缩（历史，不再维护）

* **2026-11-14（dsh 0.2.2-rc.3 复核）**：
  * **删除 `sessionPersistence.locate` 私有依赖**（desk-one 代码已切换）：会话目录改取公开
    `SessionPersistenceSnapshot.location`（rc.3 `list()` 对已落盘会话填充；pending 会话无 location，
    与既有的 BACKEND_UNSUPPORTED / 501 降级语义一致）。`storedHeaderFacts()` 现收敛 headers / sizes /
    locations 三项事实，能力门改为 `sessionPersistence.list`，`assertSessionLocationApi` 与
    `SessionLocationLike` 已删除；archive-manage 的同构调用随插件退役一并删除；
  * 删除 §C「官方 JobListAction 弹层被裁 / 被盖」整条登记（上游已 portal，见 §C 说明）；
  * 删除 theme-tone 旧 §D 条目中对应代码已在 2026-10-27 重写删除的六项（扫光带 `[class*='_row']`、
    弹窗遮罩 `[class*='_mask']`、桌面标题栏 overlay 的 inline token 探针、`workstart` 计算样式检测、
    分组菜单 `role='menu'` 结构、账号通知 `aside[data-front]`）——这些文件
    （`src/sweep.ts` / `src/mask.ts` / `src/caption.ts` / `src/workstart.ts` / `src/surface.ts`）
    当前均不存在，文档随之删除；
  * `sessionPersistence.locate` 改标「官方公开替代已存在（`snapshot.location`），收缩候选」；
  * `session_projcache` 改标「域 spec 已接入（`projectionCacheDomainSpec`），仅剩直读 / 删行 / 清扫」；
  * `WorkspaceRegistry` 条目改为「读已走公开 getter、写仍刻意走私通道」；
  * **用户归档 / 取消归档转正路**（2026-11-14 下午）：Desk One 的归档 / 取消归档路由改为直接委托官方公开
    `workspaceRegistry.archiveSession` / `unarchiveSession`——活动门、pin 摘除、后续事件（worktree 清理）与
    持久化全由官方负责；`announceArchived` / `announceUnarchiving` / `archiveIdsDroppingPins` /
    `archiveSessionSubtree` 均已删除。私有写通道只剩官方 API 无法表达的静默维护（回收站 / 删除 / 还原 /
    父子对齐 / 幽灵清扫）。
* **`dsh-vision-bridge`**（2026-09-10 退役，2026-10-27 插件目录已彻底删除）：历史记录，见 git 历史。
