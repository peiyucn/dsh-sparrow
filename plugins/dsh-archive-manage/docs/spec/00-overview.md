# 00 · 架构总览 — dsh-archive-manage

> 2026-10-28 重写为**单一现状文档**。旧 spec（01–16）已全部删除；本文只记录当前实现与已知偏离，
> 不保留提案、路线图与实施过程。

## 定位

集中管理已归档的 DSH 会话。官方「归档」只把会话从侧边栏收起：**@ 提及列表不按归档标记过滤**，
归档会话仍会挤占候选。本插件补上归档后的可见性与可回收性 —— 列出归档会话、取消归档、移入回收站、
从回收站还原、彻底删除；回收站里的会话真正离开持久化目录，因而也离开 @ 列表。

只操作会话目录与回收站目录：附件 / 存储域 / 凭据一律走官方服务；不 monkey-patch 官方，
不替换会话模型。官方原生支持同等能力后本插件退役。

## 入口

* host half 注册 `prefix` 路由 `/api/archive-manage`（见路由表）。
* client half 注册官方「主面板」两处槽位：`sidebar.panellist`（左栏图标行，`order: 20`）与
  `main` keyed 槽，共用同一个 id `archive-manage`。
* `layout` 不进 `inject`，走 `ctx.inject(['layout'], …)` 可选依赖 fork：官方布局服务不在位时
  整条不注册（惰性停用、不抛错）。
* **没有** sidebar footer 入口，也**没有**弹窗：页面在中央列正常流内，无遮罩 / `aria-modal` /
  焦点陷阱；二次确认用官方 `Modal` 原语。

## 路由契约

所有路由都在 `/api/archive-manage` 前缀下，先过信任栅栏（见硬约束）。错误统一为
`{ error: { code, message } }`。

| # | 方法 | 路径 | 请求字段 | 成功响应 |
| :-- | :--- | :--- | :--- | :--- |
| 1 | GET | `/list` | — | `{ tree: ArchiveTreeNode[] }` |
| 2 | GET | `/strays` | — | `{ items: StraySessionItem[] }` |
| 3 | GET | `/trash` | — | `{ items: TrashEntry[] }` |
| 4 | GET | `/trash-dir` | — | `{ path, displayPath }`（后者把 home 掩码成 `~`） |
| 5 | POST | `/unarchive` | `{ sessionId }` | `{ ok: true }` |
| 6 | POST | `/archive` | `{ sessionId }` | `{ ok: true, archivedIds: string[] }`（父 + 全部后代） |
| 7 | POST | `/trash` | `{ sessionId, confirm: true }` | `{ ok: true, trashId, workspaceIds, subagentIds }` |
| 8 | POST | `/delete` | `{ sessionId, confirmTitle }`；空白游离会话改用 `{ sessionId, confirm: true }` | `{ ok: true, deleted: true, workspaceIds, subagentIds }` |
| 9 | POST | `/trash-delete` | `{ trashId, confirm: true }` | `{ ok: true, trashId }` |
| 10 | POST | `/restore` | `{ trashId }` | `{ ok: true, sessionId, workspaceIds }` |
| 11 | POST | `/trash-restore-all` | `{ confirm: true }` | `{ ok: true, restored: string[], skippedLegacy, failed: { trashId, message }[] }` |
| 12 | POST | `/trash-delete-all` | `{ confirm: true }` | `{ ok: true, deleted: number, failed: string[] }` |

* `TrashEntry` 是 `TrashItem`（sidecar 可还原）与 `LegacyTrashItem`（无 sidecar）的联合；
  `subagents` 仅展示父子层级，还原 / 删除整棵走父条目。
* `ArchiveTreeNode` 递归包含 `children`，并带 `live / running / backendSupported / orphan /
  workspaceIds` 与展示事实（`project / turns / tokens / lastActiveAt / sizeBytes`）。
* 错误码：`BAD_BODY` 400、`NOT_ARCHIVED` 400、`CONFIRMATION_FAILED` 400、`TARGET_EXISTS` 400、
  `UNKNOWN_SESSION` 404、`UNKNOWN_TRASH` 404（sidecar 路径非法时 400）、`SESSION_LIVE` 409、
  `FORBIDDEN` 403、`BACKEND_UNSUPPORTED` 501、`IO_ERROR` 500。未知路由返回 404（code 仍是
  `BAD_BODY`，历史口径）。
* 路由请求 / 响应类型在 `src/contract.ts` 一处定义，host 组装与 client 消费共用。

## 数据目录与 sidecar

* 回收站根目录来自唯一配置参数 `trashRoot`（见下）。每个条目目录名为
  `<sanitizeSegment(sessionId)>-<Date.now()>`，内部是会话原目录内容 + 可选的 `subagents/`
  （随父搬走的全部后代目录）+ 记账文件 `dsh-archive-manage.json`。
* sidecar v2（`SIDECAR_VERSION = 2`）字段：
  `version`、`sessionId`、`title`、`originalPath`、`archivedAt`（ISO）、`workspaceIds`、
  `subagents?: { sessionId, title, originalPath, workspaceIds, parentSessionId? }[]`。
  v1（无 `subagents`）仍可读取与还原；`parentSessionId` 用于回收站树的任意深度缩进，缺失时平铺。
* **无 sidecar 的旧格式目录**：按 `legacyTrashItem` 收纳 —— `trashId` / `sessionId` / `title`
  都取目录名，`archivedAt` 取目录 mtime，`workspaceIds` 为空；只能列出与彻底删除，不能还原。
  「全部还原」跳过它们并回报 `skippedLegacy`；「全部删除」会一并删除。
* 还原：校验 `originalPath` 是绝对路径 + 末段是安全的单会话目录名，条目仍在 `trashRoot` 内；
  目标目录已存在且非空 → `TARGET_EXISTS`（不覆盖）。父目录 `rename` 回原位后**立即**删除
  sidecar（避免记账文件污染用户会话目录），再逐个移回 `subagents/`，最后恢复工作区记账与归档集。
* 标题三档：live 投影快照 → 冷投影缓存行（按官方方法形参个数自适应）→ 有界日志折叠
  （8s 整批预算）；取不到回退会话 id。子会话标签另走官方 subagent 投影（含自有后缀门）。

## 唯一配置参数

| 参数 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `trashRoot` | `$DSH_HOME/.sessions-trash`（`$DSH_HOME` 缺省 `~/.dsh`） | 回收站根目录；在 `cordis.patch.yml` 的 `config.trashRoot` 覆盖。空串视为非法配置，启动即报错。 |

## 硬约束

1. **父子整树**：`/list` 输出父子树；`/archive` 一次写入父 + 全部后代；`/trash` / `/delete`
   搬运 / 删除全部后代（任意深度，`subagentDescendantIds`）；sidecar 记录已搬走的子会话；
   还原整棵一起移回；归档集清理用根 + 全部后代，避免深度 ≥2 的后代变成孤儿根。
2. **回收站不失效投影行**：移入回收站只改目录位置、会话身份未变，投影行保留（否则还原后子会话
   标题退化为首条用户消息）。彻底删除才失效投影行（最多重试 2 次，仍失败只告警，启动清扫兜底）；
   启动清扫还会删除持久化里已不存在的投影行。
3. **还原路径必须在 `trashRoot` 内**：`trashId` 先消毒再 `resolve`，结果必须仍是 `trashRoot`
   本身或其子路径；sidecar 的 `originalPath` 还要过绝对路径 + 安全目录名校验，防篡改后把目录
   rename 到任意位置。
4. **Host + Origin 栅栏**：官方栅栏只挂在 `/api` 前缀，而本插件路径更长（最长前缀者胜），
   故 handler 第一件事就是 `isTrustedPluginRequest`：Host 必须回环或命中官方信任面
   （`webStartup.trustedHosts` / 旧 `webRuntime` / `webServer.host` 绑定地址），
   `Origin` 必须与 Host 同 authority（`null` 拒绝），`sec-fetch-site: cross-site` 拒绝。
   官方信任面的条目先过 `assertTrustedAuthority`，非法条目**丢弃 + 告警**、不抛错。
5. **写通道复用官方**：归档集走 `WorkspaceRegistry.enqueueOperation + requireState + setState`；
   文件位置只读 `sessionPersistence.locate`；投影域只走 `storageDomain`。两处私有 seam 见下。

## 能力门

* **host**（抛错版 `assertCapabilities`，cordis 逐插件标 inactive）：会话格式
  `SESSION_FORMAT_VERSION ∈ {0, 3, 4}`（`assertHostCompatible`）+ 7 个硬依赖
  （`webServer.register` / `sessions` / `agents` / `workspaceRegistry` / `sessionPersistence.locate` /
  `sessionQuery` / `storageDomain`）+ 两处私有 seam 的启动检查。请求期另有宿主真值 header 格式门
  （`/trash` / `/delete`）；`/restore` 有意不设该门 —— 撤销路径必须始终可走。
* **client**（不抛错版 `warnMissingCapabilities`）：`slots.inject`、`slots.register`、
  `locale.register`、`locale.bind`、`remote.$on`。缺任一 → 告警一条 + 直接 return，
  不注册任何槽位 / 样式 / 监听。client half 不能抛错：boot 审计把非 active entry 当致命失败，
  抛错会让宿主整页只显示 "Failed to load plugins"。
* 样式表由 `ensureArchiveStyles()` 注入并返回 style 元素，`apply` 用 `ctx.effect` 登记移除；
  重复安装 / HMR 命中旧标签时只刷新内容，不叠加第二张样式表。

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/constants.ts` | 路由前缀 / 路由表 / sidecar 版本 / 请求体上限 / 缓存 TTL / LRU 上限 / 分页 / 防抖 / 投影域名 |
| `src/contract.ts` | 12 条路由的请求 / 响应 DTO（host 与 client 共用，零运行时依赖） |
| `src/archive.ts` | 纯逻辑：配置、sidecar 解析、回收站条目视图、会话树、归档对齐、LRU / 预算 / 有界并发 |
| `src/host.ts` | host half 组合根：能力门 → 装配路由 → 启动清扫接线 |
| `src/host/http.ts` | JSON 收发、请求体读取、统一错误类型 |
| `src/host/gates.ts` | host 能力 / 会话格式门与两处私有 seam 的启动自检 |
| `src/host/headers.ts` | header 事实缓存 store、双形状读取、树结构投影 |
| `src/host/projection.ts` | 官方投影缓存域解析、行读取、失效与启动清扫 |
| `src/host/titles.ts` | 标题三档 + subagent 标签三档（含形参自适应缓存读取） |
| `src/host/archive-set.ts` | 归档集读改写、工作区记账、父子对齐、幽灵清扫、unarchive 通知 |
| `src/host/trash.ts` | 回收站目录 / 清单 / 还原 / 删除 |
| `src/host/session-files.ts` | 会话目录定位、占用守卫、子会话目标收集、移入回收站 / 彻底删除 |
| `src/host/views.ts` | `GET /list` 归档树与 `GET /strays` 游离清单的 DTO 组装 |
| `src/host/routes.ts` | 12 条路由的信任栅栏、请求校验与表驱动分发 |
| `src/host/startup.ts` | 启动三项清扫的延迟兜底与事件接线（缓存失效 / 父子对齐） |
| `src/host/events.ts` | 官方 `api-session/*` 事件的类型补充 |
| `src/trust.ts` | Host / Origin / sec-fetch-site 栅栏与官方信任面复用 |
| `src/compat.ts` | host 两档门（能力 / 会话格式）与惰性探针 |
| `src/client/index.ts` | client 入口：注入 locale 字典 + 委托安装 |
| `src/client/i18n.ts` | client locale 字典（zh / en） |
| `src/client/install.ts` | 能力门 → 样式（effect 清理）→ locale → remote 桥 → 主面板两处注册 |
| `src/client/compat.ts` | client 不抛错能力门（`warnMissingCapabilities` / `hasCapability`） |
| `src/client/styles.ts` | 归档页样式表（注入 / 复用 / 返回 style 元素）+ 页面静态 inline style |
| `src/client/ArchivePage.tsx` | 页面容器：状态、数据加载、事件与动作编排 |
| `src/client/ConfirmModal.tsx` | 二次确认框（官方 `Modal` 原语） |
| `src/client/rows.tsx` | 归档 / 游离 / 回收站行渲染器（含分页预算） |
| `src/client/format.ts` | 字节 / token / 创建龄 / 会话事实行格式化 |
| `src/client/window.ts` | 可见行计数与回收站树预算 |
| `src/client/{archivedTree,panel}.ts` | 本地树变更 / 展示判定、主面板入口装配 |

## 已知偏离 / 已知问题

* **client 原无能力门，本阶段已补**：五条硬依赖缺失时只告警并惰性停用；`layout` 仍走可选 fork。
* **两处私有 seam**（登记在 `docs/private-seams.md`）：① `WorkspaceRegistry` 的
  `enqueueOperation / requireState / setState`；② `sessionPersistence.locate`。两者启动即检查，
  官方移除即 fail-fast，不影响 dsh 与其余插件。
* **回收站分页计数**：`trashTotal` = 父条目 + sidecar 的**全部** subagent 条目；sidecar v2 记的
  就是随父搬走的整棵后代（扁平清单），与渲染行数一致，不存在深度 ≥2 的少算。
* **held 会话语义**：本次 dsh 运行中仍被进程占用（`ctx.sessions.get` / `ctx.agents.get` 命中）的
  会话不能移动文件 —— 归档区内分组置灰、host 兜底拒绝（409）。「取消归档」只改归档集、不动文件，
  可立即执行；**关闭该会话（或停止生成）后即可立即重试**，不要求下次启动。
* **投影域名是「官方优先 + 回退」**：官方 `projectionCacheDomainSpec` 不在本插件依赖面内，
  `apply` 期间尽力 `import` 读取；读不到用 `session_projcache` / `sessions` 字面量。
* 未知路由返回 404 但错误码沿用 `BAD_BODY`（历史口径，未改）。
* `trashDirNames` 只列出 `[A-Za-z0-9_-]+` 的目录名；插件自己创建的条目都满足（`sanitizeSegment`）。

## 测试地图

* `test/archive.test.mjs` —— sidecar 解析、回收站视图、树构建 / 归档对齐 / 子树 id、LRU、预算信号、
  有界并发、header 事实缓存。
* `test/host.test.mjs` —— `resolveTrashDir`、`sessionDirectoryFor`、私有 seam 检查、
  `addedSummaryFor`、`titlesFor` 批量折叠、`subagentLabel` 三档读链。
* `test/route.test.mjs` —— 真实 `apply` + handler：信任栅栏、确认失败、ENOENT 宽恕、请求体
  （>64KB / 非法 JSON / 数组）400、500 路径 logger 告警。
* `test/trust.test.mjs` —— 回环判定、Origin / sec-fetch-site、官方信任面复用与非法条目丢弃、
  栅栏调用顺序。
* `test/compat.test.mjs` —— 会话格式门与 host 能力门。
* `test/client-install.test.mjs` —— client 能力门（缺任一不注册 / 不抛 / 告警一条）与样式生命周期。
* `test/panel.test.mjs` —— `attachMainPanel` 的可选 fork 与两处注册形状。
* `test/archived-tree.test.mjs` / `test/window.test.mjs` —— 本地树摘除与可见行计数 / 回收站分页预算。
* `test/structure.test.mjs` —— 文档单一 spec、包清单 / 出口、主面板形态、样式规则与死代码守卫。
