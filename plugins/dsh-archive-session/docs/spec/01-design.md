# 01 · 设计 —— dsh-archive-session

> 本文是 seam 查证 + 架构提案；「待查证」条目未确认，开工前需补查。

## DSH seam 查证结论（已 grep 源码确认）

* 归档 API：`workspace` 公开 `archiveSession(sessionId)`（`packages/workspace/workspace/src/index.ts:244`），归档集持久化在 `~/.dsh/storages/workspace.json` 的 `archivedSessionIds`。
* 已复核：`workspace` 无公开「取消归档 / 列出已归档」方法（spec 注释提到 unarchive，但 grep 未见公开方法）。
* 会话删除：无官方「删除会话日志」API（客户端 workspace 接口无 deleteSession；`session.*` 接口无 delete；`SessionPersistence` 无 delete）。社区插件用删除链实现（dsh-plugin-session-delete / dsh-session-manager README 实证）：停会话 → 删日志目录 → 清理记账 → 同步帧。
* 会话查询：`ctx.sessionQuery`（`listSessions` / `readTitleSnapshots` / `readSurface`）与 `ctx.sessionReferenceResolver`（`candidates`）为宿主平面服务。
* Remote：客户端 `@` 源 `ui-reference` 经 `ctx.remote.sessionReferenceResolver` / `ctx.remote.fileReferences` 走宿主。
* 留档备用 seam：`workspaceDomainSpec`（已从 `@deepseek-ai/dsh-workspace/src/spec` 导出，可经 `ctx.storageDomain` 读写 `archivedSessionIds` / `workspaces` 记账）；归档集变更的客户端同步帧为 workspace-controller 的 `{type:'archived'}` follow 帧（`packages/api/workspace-controller/src/feed.ts:112-115`，2026-08-30 复核；旧文档所记 `host/archived-sessions-changed` 帧不存在）；`SessionPersistence.locate(meta)`（公开，可拿日志路径）。

## UI 入口与摆放（定案）

* **侧边栏 footer 动作区加一个入口按钮**（公开 slot `sidebar.footer.action`），点开弹窗列出归档会话。
* 已查证：`ui-workspace` 工具栏没有可注入 slot；本插件采用 `ui-sidebar` 的 `sidebar.footer.action`（`packages/client/ui-sidebar/src/client/index.ts:52`）。

## 三档操作的可行性

### 轻量标题（`@` 仍可拉回，= 路线 A，公开 seam，已退役 2026-08-30）

* 装配层替换 / 包装 `sessionReferenceResolver`（或 `sessionQuery`）：候选标题走短 TTL 缓存 / 轻量读取；保持原签名与 `this` 语义、可逆恢复；记录适配的 dsh 版本。
* 生效后**所有**会话（含归档）`@` 都轻量且仍可拉回——天然是归档会话默认态，无需逐会话开关。

### 备份（可逆）与删除（不可逆）——共用一条清理链

备份 = 移动，删除 = `rm`。两者共用同一清理链，仅第 2 步动作与确认强度不同：

1. **活动会话防护**：本次 dsh 运行中驻留（未释放）的会话无法被插件卸载（teardown 是官方持有且丢弃的能力、无公开结束 API），host 侧一律拒绝（生成中给「先停止生成」），面板把这类会话在归档区内分组前置并置灰操作（角标「未释放」警示色、按钮悬停提示）；
2. **备份：移动会话目录** 到插件备份夹（默认 `$DSH_HOME/sessions-archived-backup/`）；**删除：`rm` 会话目录**；只对 `SessionPersistence.locate(meta)` 返回 `kind: 'jsonl'` 的已知单会话目录执行；
3. **清理记账**：经 `ctx.storageDomain.open(workspaceDomainSpec)` 从 `archivedSessionIds` 与 `workspaces` 表 `sessionIds` 移除该 id，内存 / 磁盘一致；
4. **同步帧**：广播 `host/archived-sessions-changed` / workspace 变更帧同步客户端；备份移回时反向操作。

**确认强度**：备份 = 二次确认（标题 + 可逆说明）；删除 = 不可逆警示 + 更强确认（如输入会话标题）。

**seam 特例（已定，写入插件 AGENTS.md）**：第 2 步直接移动 / 删除会话目录是唯一越过公开 API 的一步（DSH 无删除 API）。本插件只碰会话日志目录、不碰其它内部文件；边界 = 按档确认、拒绝未释放的会话、完整清理记账。

## 待查证 / 开放问题

1. ✅ 入口按钮：`ui-workspace` 无对应 slot，改用 `sidebar.footer.action`。
2. ✅ `workspace` 无公开 unarchive；归档集读写经 `workspaceDomainSpec` + `ctx.storageDomain`，workspace 记账用 `WorkspaceEntity.detachSession/attachSession`。
3. 三档已定：轻量标题 / 备份（可逆）/ 删除（不可逆），备份与删除的 seam 特例写入 `plugins/dsh-archive-session/AGENTS.md`（已定案）。
4. ✅ 路线 A 包装 `sessionQuery.readTitleSnapshots`（短 TTL LRU + `session/title` 失效），不连带 `fileReferences`。

## 适配版本基线

本机 dsh checkout：`~/.dsh-launcher-panel/source`。开工时记录所适配 dsh 版本。
