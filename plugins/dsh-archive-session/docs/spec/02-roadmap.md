# 02 · 路线图 —— dsh-archive-session

> M1/M2 已实现，剩余热更验证与发布检查。

## M1 · 查证与定案

* [x] 补查：`workspace` 无公开 unarchive；`ui-workspace` 无工具栏 slot（改用 `sidebar.footer.action`）；`sessionQuery` 实例方法可包装。
* [x] 定案：路线 A 包装 `sessionQuery.readTitleSnapshots`；备份夹 `$DSH_HOME/sessions-archived-backup/`（沿用旧版实际目录；无 sidecar 的旧目录按「仅列出/删除」收纳）。
* [x] 退役路线 A：dsh 0.1.2-alpha.1 官方 `sessionProjectionCache` 已覆盖标题读取解码路径，TTL 包装删除。
* [x] 备份区折叠（默认收起）+ 全部恢复 / 全部删除（`backup-restore-all` / `backup-delete-all`，旧格式跳过并计入 skippedLegacy）。

## M2 · 按定案实现（路线 A + 归档查看 + 备份 / 删除 / 恢复）

* [x] 侧边栏 footer 入口按钮 + 弹窗（列出归档会话 + live / running 状态），状态一致、可打断。
* [x] 路线 A：`readTitleSnapshots` 短 TTL LRU 缓存 + 标题事件失效；纯逻辑单测；`npm run verify`。
* [x] 备份 / 删除共用清理链：活动会话拒绝（dsh 运行期间无法卸载）→ 移动（备份）/ `rm`（删除）→ `WorkspaceEntity.detachSession` + `workspaceDomainSpec` 归档集更新 → `domain/changed` 自动同步帧；备份二次确认、删除强确认；备份可移回。
* [x] 文档：seam 特例写入插件 AGENTS.md；备份夹位置与恢复方法写入 README。

## M3 · 验证与发布

* [ ] dsh checkout 热更验证（当前 session 停/卸、备份、删除、恢复、@ 标题缓存）
* [ ] 对要发布的插件执行《代码审计》；README / package.json 对齐；打 tag 发布（流程见根 AGENTS.md）。

## 明确不做（owner 定案）

* **全文搜索 / 全文索引 UI**（2026-09-01 拍板）：不做。检索交给模型——官方 `tool-session-query`（`searchSessions` / `searchEvents`）+ @ 引用已覆盖；需要查证时走「恢复 → @ 引用 → 让模型翻」。关键词搜索是盲目堆料：建索引贵、命中差、转述 / 多语言场景基本失效。
* 其余竞品堆料不追（自动归档、预览等）；**多工作区移动不做**（2026-09-01 拍板）：会话 cwd 固化在不可变 header 里（官方 `attachSession` / `detachSession` 只改工作区成员关系、不改实际工作目录），「移动」只会造成归属与 cwd 不一致的误导；目录搬家 / 建错目录的正解是归档旧会话 + 新目录开新会话。每个功能须有收场条件（官方原生支持即退役）。
