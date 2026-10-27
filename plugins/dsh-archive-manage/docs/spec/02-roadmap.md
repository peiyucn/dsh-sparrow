# 02 · 路线图 —— dsh-archive-manage

> 2026-10-28 重写：删除已被 07/12/16 取代的旧方案（footer 入口、`sessions-archived-backup/` 备份夹、
> `backup-restore-all` / `backup-delete-all`）。本文件只保留「已定案」与「明确不做」。

## 已定案（现状）

* [x] 入口 = 主面板页面 + `sidebar.panellist`（spec 16），旧 footer / 弹窗方案废弃。
* [x] 回收站语义：会话目录移入 `~/.dsh/.sessions-trash`，支持整体/逐个恢复与彻底删除（spec 12–15）。
* [x] 归档集与 workspace 记账同步：`WorkspaceRegistry` 私有写通道 + `workspaceDomainSpec`，`domain/changed` 驱动刷新。
* [x] 子代理折叠标题以宿主 `sessionProjections` 为真值，本地 LRU 上限 256、TTL 30s（spec 10）。
* [x] 服务端 `/api/archive-manage/*` 单前缀路由；客户端 4 份请求包装待合并（重构待办）。
* [x] 面板刷新不闪（spec 11）；默认折叠树（spec 15）；恢复后 sidecar 清理（spec 13）。

## 待办

* [ ] `assertCapabilities` 接进 host apply（7 个硬依赖当前无启动自检）。
* [ ] `'session_projcache'` / `'sessions'` 硬编码存储域换公开 `projectionCacheDomainSpec`。
* [ ] 1543 行 `host.ts` 按 seam 拆分；1379 行 `ArchivePanel` 拆组件、3 段树渲染合一。
* [ ] spec 全部收敛为单一 `00-overview`（当前 14 篇，含已迁移/历史记录）。

## 明确不做（owner 定案）

* **全文搜索 / 全文索引 UI**（2026-09-01）：不做。检索交给模型——官方 `tool-session-query`
  （`searchSessions` / `searchEvents`）+ @ 引用已覆盖；关键词搜索建索引贵、命中差。
* 其余竞品堆料不追（自动归档、预览等）；**多工作区移动不做**（2026-09-01）：会话 cwd 固化在不可变 header，
  「移动」只会造成归属与 cwd 不一致的误导。
* 每个功能须有收场条件（官方原生支持即退役）。
