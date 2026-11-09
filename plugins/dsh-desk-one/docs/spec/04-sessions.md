# 04 · Sessions（Agent 会话）

## 背景与目标

DeskOne 的定位是"人与 agent 共享的工作台"，会话是工作台里的核心对象。归档管理插件
（`dsh-archive-manage`）已经承担了会话归档、回收站、还原 / 彻底删除、备份等能力；长期目标
是把它并入 DeskOne，用一个 **Sessions（Agent 会话）** 标签页统一呈现：

- 活跃会话：按工作区分组，子代理会话嵌套在父会话下；活跃/归档共用 `src/tree.ts` 的 `nestTree` 与 `SessionTreeRow`，父子规则与行渲染只有一套实现；
- 归档会话：按父子关系展示；
- 回收站与备份：由归档能力迁移后接入；
- 所有会话操作与任务 / 便签共用同一套按钮语言。

## 分阶段

### Phase 1：只读目录（已交付）

- 新增 `会话 / Sessions` 标签页；
- 数据来自客户端 `sessions.list` / `workspaces.list` 可选服务，不新增 host 路由、不读写会话文件；
- 活跃会话：排除归档集成员，先按 `parentId` 组父子树，再按根会话的 `cwd` / 工作区分组；组内运行中优先、再按更新时间；
- 归档会话：只取归档集成员，按 `parentId` 组成树；父不在归档集时提升为根，环路降级不丢条目；
- 点击活跃会话打开；归档 / 不可用行只读并显示状态；
- 宿主缺少会话服务时显示降级提示，不报错。

### Phase 2：迁移归档 host 能力（第二阶段 A1，已实现 2026-11-09）

> 状态：host 能力已迁入 `src/host/sessions/**`，路由挂 `/api/desk-one/sessions/*`；本阶段无用户可见 UI。归档插件并存期间两边共用同一份回收站目录与官方状态，幂等。真实会话数据的破坏性验收留给 Phase 3（owner 真机、临时会话）。

把归档插件的以下能力抽成 `src/host/sessions/` 内部模块（独立目录 + 独立测试，沿用能力门与信任围栏），路由挂到 `/api/desk-one/sessions/*`；**先能力对等，再改 UI**。

| 模块 | 职责 |
| :--- | :--- |
| `archive.ts` | 纯逻辑：配置归一、sidecar v1/v2 解析、归档树 / 父子对齐 / 子树 id、header 事实缓存、LRU / 预算 / 有界并发、掩码与强确认 |
| `compat.ts` | 会话格式门：`SESSION_FORMAT_VERSION` 支持集合 + 宿主 header.version 真值门 |
| `gates.ts` | 两处私有 seam 的启动自检：`WorkspaceRegistry` 写通道、`sessionPersistence.locate` |
| `headers.ts` | `sessionPersistence.list()` 双形状兼容 + TTL 单飞缓存 |
| `projection.ts` | 投影缓存读取（`cachedSnapshot` 形参自适应）、失效、启动清扫（**保留回收站会话行**） |
| `projection-seed.ts` | 还原 / 启动修复：冷日志 → `coldSnapshot` 写回 → 补发带 cached 块的 `api-session/added` |
| `titles.ts` | 标题三档（live 投影 → 冷投影行 → 有界日志折叠）+ 子会话标签三档 |
| `archive-set.ts` | 归档集读写（官方串行写链）、父子对齐、幽灵 id 清扫、工作区记账、事件补发 |
| `trash.ts` | 回收站清单 / 位置 / 还原 / 删除（sidecar 磁盘格式 **`dsh-archive-manage.json` 不变**） |
| `session-files.ts` | 会话目录定位、占用守卫、任意深度子会话整树移动 / 删除 / 回滚 |
| `views.ts` | `/list` 归档树、`/strays` 游离会话 DTO |
| `routes.ts` | 12 条路由表（`SESSION_ROUTES`），复用 desk-one 现有 trust / http / router |
| `startup.ts` | 三项启动清扫：30s 延迟兜底 + 首次列表补跑（**不在 apply 抢官方扫盘**） |
| `install.ts` | 组合 sessions 装配（门 → 缓存 → 清扫 → 路由依赖），可单测 |

**路由（全部在 `/api/desk-one/sessions/` 前缀下，信任栅栏由 desk-one router 统一执行）**

| 方法 | 路径 | 作用 |
| :--- | :--- | :--- |
| GET | `list` | 归档树 + 事实（turns/tokens/size/live/孤儿） |
| GET | `strays` | 游离会话（持久化有 ∧ 未归档 ∧ 未挂工作区） |
| GET | `trash` | 回收站清单（sidecar + 旧格式） |
| GET | `trash-dir` | 回收站路径（home 掩码为 `~`） |
| POST | `unarchive` | 取消归档（幂等，不碰文件） |
| POST | `archive` | 归档（父为单位整棵子树进归档集） |
| POST | `delete` | 彻底删除（普通会话逐字标题强确认；空白游离会话 `confirm:true`） |
| POST | `trash` | 移入回收站（`confirm:true`；占用 409；后端不支持 501） |
| POST | `restore` | 单个还原（live 守卫、`TARGET_EXISTS` 不覆盖） |
| POST | `trash-restore-all` | 全部还原（响应后后台回填） |
| POST | `trash-delete` | 单个回收站条目彻底删除 |
| POST | `trash-delete-all` | 全部彻底删除 |

**Phase 2 数据与边界**

| 项 | 决定 |
|---|---|
| 存储 | 不新增表、不写 `desk_one` 域；归档集在官方 workspace 域，回收站在磁盘 `trashRoot`，投影行在官方 `session_projcache` |
| 私有 seam | 沿用已登记的 3 条（`sessionPersistence.locate`、WorkspaceRegistry 写通道、投影缓存域），登记从 archive 移挂到 desk-one；顺手把投影域字面量改为 import 官方 `projectionCacheDomainSpec` |
| 配置 | `apply(ctx, config)` 增加 `trashRoot`（默认 `$DSH_HOME/.sessions-trash`）；改过归档插件 `trashRoot` 的用户需把同一路径填到 desk-one |
| 依赖 | `package.json` 增加 sessions / agents / workspace / session-persistence / session-query / projection-cache 的 peer + dev（精确 `0.2.2-rc.1`），并进 `inject`（与归档插件同口径） |
| 备份定义 | 本插件没有独立「导出 / 打包」能力；spec 中的「备份」= 回收站（可逆移出 + sidecar 记账）。真正的导出/备份是新增功能，须另立项 |
| 启动时机 | 扫描延迟 + 首次列表兜底；timer 在 `ctx.effect` 清理 |
| 并发期 | 与归档插件并存时两边都扫描、共用默认回收站；Phase 2 无 UI，写路由仅供验证，界面操作留在 Phase 3 |

**Phase 2 验收**

- `GET /api/desk-one/sessions/list` 与归档插件 `/list` 数据一致（真实数据抽样）；
- 归档 / 取消归档 / 移入回收站 / 还原 / 彻底删除在临时会话上行为与归档插件一致；
- 子会话整树、游离会话、未释放会话、旧格式回收站、`trashRoot`、投影行保留 / 失效 / 回填 均有测试覆盖；
- 插件 `npm run verify` 与根 `pnpm run check` 全绿；Phase 1 只读视图不回归。

### Phase 3：管理 UI 与退役（第二阶段 A2，UI 已实现 2026-11-09）

> 状态：Sessions 页已接入归档管理 UI（归档区 / 游离会话 / 回收站，取消归档、移入回收站、还原、全部还原、彻底删除、路径复制、子会话树折叠、强确认）。**退役尚未执行**：按决策 8，需 owner 真机验证 Desk One 首发版本后再 deprecate 归档插件；npm deprecate 由 owner 执行。

- Sessions 页接入归档 / 取消归档、移入回收站 / 还原 / 彻底删除、归档区与回收站并列展示、子会话树折叠与计数、游离会话、未释放分组、强确认、回收站路径复制、加载更多；**子会话行只读**（归档 / 回收站 / 彻底删除始终以父会话为单位），各分区按 100 行分页「加载更多」；
- 与活跃会话共用操作语言与二次确认；外部事件用官方 `Modal` 原语；
- 功能对等并通过真实数据验证（owner 真机）后退役 `dsh-archive-manage`：
  - **owner**：npm deprecate（不得 unpublish）、市场索引最终下架确认；
  - **agent**：README / CHANGELOG / AGENTS 项目概况、SECURITY 支持清单、`RETIRED_PLUGINS`、删除插件目录、市场索引重生成、发布说明（含迁移指引）；
  - 退役不早于 Desk One 首发且经 owner 真机验证的版本；旧包在 npm 仍可临时重装兜底。

## Phase 1 数据与边界（已实现，保留）

| 项 | 来源 |
|---|---|
| 会话列表 / 标题 / running / parentId | `ctx.sessions.list` 客户端快照（经 bridge） |
| 归档集 | `ctx.workspaces.list.archivedSessionIds` |
| 工作区分组 | `workspaces.list.items` 的 `title` / `sessionIds`；不在任何工作区的会话回退到 `cwd` 最后一段路径，仍没有则归入未记录工作区 |
| 打开会话 | `uiWorkspace.openSession`，仅可用会话生效 |

**Phase 1 非目标**：归档 / 取消归档、回收站、永久删除、备份、跨工作区移动、agent 工具；Phase 2/3 逐项补齐。

## 验收（Phase 1 保留）

- `会话` 标签出现，活跃会话按工作区分组、running 优先；
- 归档会话显示父子缩进树，只读；
- 归档 / 不可用会话不可点击打开；
- 宿主缺会话服务时降级提示，不抛错；
- `verify` 全绿，catalog 纯函数有单测。
