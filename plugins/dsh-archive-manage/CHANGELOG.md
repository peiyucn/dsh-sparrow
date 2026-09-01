# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First published version, released to the `next` channel for owner validation before the stable `0.1.0`
- Sidebar footer "Archive" entry with a panel split into two sections: archived / backup
- Archived section: backup (moves the session off disk, reversible) or delete (irreversible, requires typing the full session title to confirm); sessions still held open in this dsh run are grouped and greyed out, actionable after the next dsh restart
- Backup section: restore or delete individually / in bulk; the backup location is shown at the top of the panel and copyable
- Backups write a sidecar (original path / workspace membership) used for restore; legacy directories without a sidecar are list/delete only
- Backup / delete also handles all subagent sessions of the parent session (moved into the backup together, restored together; orphan subagents are cleaned by the startup sweep)
- Removed from the @ list immediately after backup: updates the official workspace domain bookkeeping, invalidates projection-cache rows, and re-emits the `api-session/removed` event
- README positioning: the official archive flag does not filter @ candidates (verified through all three layers of the source); file-level backup is the only reversible way to take a session out of @

### 中文

- 首个发布版本，先发 `next` 渠道供 owner 验证，稳定版 `0.1.0` 待转正
- 侧边栏 footer 新增「归档」入口，面板分归档区 / 备份区两个区块
- 归档区：备份（把会话目录移出磁盘，可逆）或删除（不可逆，需输入完整会话标题确认）；本次 dsh 运行中仍占用的会话单独分组置灰，下次启动 dsh 后可操作
- 备份区：单条或批量恢复 / 删除；备份位置在面板顶部明示并可复制
- 备份时写 sidecar（原路径 / 工作区归属）供恢复使用；无 sidecar 的旧格式目录按「仅列出 / 删除」收纳
- 备份 / 删除同时处理父会话的全部 subagent 会话（一并移入备份、一并恢复；孤儿 subagent 由启动清扫清理）
- 备份后立即从 @ 列表消失：同步官方 workspace 域记账、失效投影缓存行、补发官方 `api-session/removed` 事件
- README 定位说明：官方归档标记不会过滤 @ 候选（经源码三层链路查证）；文件级备份是让会话离开 @ 的唯一可逆手段
