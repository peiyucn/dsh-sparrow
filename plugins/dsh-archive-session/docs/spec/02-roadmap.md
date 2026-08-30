# 02 · 路线图 —— dsh-archive-session

> M1/M2 已实现，剩余热更验证与发布检查。

## M1 · 查证与定案

* [x] 补查：`workspace` 无公开 unarchive；`ui-workspace` 无工具栏 slot（改用 `sidebar.footer.action`）；`sessionQuery` 实例方法可包装。
* [x] 定案：路线 A 包装 `sessionQuery.readTitleSnapshots`；备份夹 `$DSH_HOME/sessions-archived-backup/`（沿用旧版实际目录；无 sidecar 的旧目录按「仅列出/删除」收纳）。
* [x] 退役路线 A：dsh 0.1.2-alpha.1 官方 `sessionProjectionCache` 已覆盖标题读取解码路径，TTL 包装删除。
* [x] 备份区折叠（默认收起）+ 全部恢复 / 全部删除（`backup-restore-all` / `backup-delete-all`，旧格式跳过并计入 skippedLegacy）。

## M2 · 按定案实现（路线 A + 归档查看 + 备份 / 删除 / 恢复）

* [x] 侧边栏 footer 入口按钮 + 弹窗（列出轻归档会话 + live / running 状态），状态一致、可打断。
* [x] 路线 A：`readTitleSnapshots` 短 TTL LRU 缓存 + 标题事件失效；纯逻辑单测；`npm run verify`。
* [x] 备份 / 删除共用清理链：停会话 → flush → 移动（备份）/ `rm`（删除）→ `WorkspaceEntity.detachSession` + `workspaceDomainSpec` 归档集更新 → `domain/changed` 自动同步帧；备份二次确认、删除强确认；备份可移回。
* [x] 文档：seam 特例写入插件 AGENTS.md；备份夹位置与恢复方法写入 README。

## M3 · 验证与发布

* [ ] dsh checkout 热更验证（当前 session 停/卸、备份、删除、恢复、@ 标题缓存）
* [ ] 对要发布的插件执行《代码审计》；README / package.json 对齐；打 tag 发布（流程见根 AGENTS.md）。
