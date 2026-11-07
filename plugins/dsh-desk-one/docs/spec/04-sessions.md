# 04 · Sessions（Agent 会话）

## 背景与目标

DeskOne 的定位是"人与 agent 共享的工作台"，会话是工作台里的核心对象。归档管理插件
（`dsh-archive-manage`）已经承担了会话归档、回收站、还原 / 彻底删除、备份等能力；长期目标
是把它并入 DeskOne，用一个 **Sessions（Agent 会话）** 标签页统一呈现：

- 活跃会话：按工作区分组；
- 归档会话：按父子关系展示；
- 回收站与备份：由归档能力迁移后接入；
- 所有会话操作与任务 / 便签共用同一套按钮语言。

## 分阶段

### Phase 1：只读目录（当前）

- 新增 `会话 / Sessions` 标签页；
- 数据来自客户端 `sessions.list` / `workspaces.list` 可选服务，不新增 host 路由、不读写会话文件；
- 活跃会话：排除归档集成员，按 `cwd`（工作区路径）分组；组内运行中优先、再按更新时间；
- 归档会话：只取归档集成员，按 `parentId` 组成树；父不在归档集时提升为根，环路降级不丢条目；
- 点击活跃会话打开；归档 / 不可用行只读并显示状态；
- 宿主缺少会话服务时显示降级提示，不报错。

### Phase 2：迁移归档 host 能力

- 把归档插件的归档集读写、回收站（移入 / 还原 / 彻底删除）、会话文件移动、header / 投影缓存
  回填、备份能力抽成 DeskOne host 内部模块（独立目录 + 独立测试，沿用能力门与信任围栏）；
- 路由挂到 `/api/desk-one/sessions/*`；
- 先能力对等，再改 UI。

### Phase 3：管理 UI 与退役

- Sessions 页接入归档 / 取消归档、移入回收站 / 还原 / 彻底删除、备份等操作；
- 与活跃会话共用操作语言与二次确认；
- 功能对等并通过真实数据验证后，把 `dsh-archive-manage` 标记 deprecated，市场索引与文档
  给出迁移说明。

## Phase 1 数据与边界

| 项 | 来源 |
|---|---|
| 会话列表 / 标题 / running / parentId | `ctx.sessions.list` 客户端快照（经 bridge） |
| 归档集 | `ctx.workspaces.list.archivedSessionIds` |
| 工作区分组 | `workspaces.list.items` 的 `title` / `sessionIds`；不在任何工作区的会话回退到 `cwd` 最后一段路径，仍没有则归入未记录工作区 |
| 打开会话 | `uiWorkspace.openSession`，仅可用会话生效 |

**非目标（Phase 1）**：归档 / 取消归档、回收站、永久删除、备份、跨工作区移动、agent 工具。

## 验收

- `会话` 标签出现，活跃会话按工作区分组、running 优先；
- 归档会话显示父子缩进树，只读；
- 归档 / 不可用会话不可点击打开；
- 宿主缺会话服务时降级提示，不抛错；
- `verify` 全绿，catalog 纯函数有单测。
