# dsh-archive-session

DeepSeek Harness（DSH）Web 插件 —— 归档会话管理（dsh-sparrow 合集成员）。

与官方「轻归档」互补：官方把会话从侧边栏藏起来；本插件在**侧边栏 footer 动作区**加一个入口按钮（查证结论：`ui-workspace` 工具栏没有可注入 slot，故采用公开 slot `sidebar.footer.action`），点开弹窗列出所有轻归档会话——

* **备份（`@` 不可达，可逆）**：把会话目录移到插件备份夹，`@` / 列表不再出现；可移回恢复。
* **删除（`@` 不可达，不可逆）**：`rm` 会话目录，不可恢复；不可逆警示 + 输入完整标题强确认。
* **备份区**：默认折叠；支持单个 / 全部恢复与删除；无 sidecar 的旧格式备份按「仅列出 / 删除」收纳。

> 轻量标题（路线 A）已退役：dsh 0.1.2-alpha.1 起官方 `sessionProjectionCache` 已覆盖 @ 候选标题的昂贵解码路径。

主 UI 保持干净，只多一个按钮。

**状态：🚧 M1+M2 已实现** —— 适配 dsh ≥ 0.1.1-rc.2；设计文档见 [docs/spec/](docs/spec/)。

## 本地验证

```bash
npm run verify
```

## 备份位置与恢复

* 默认备份夹：`$DSH_HOME/sessions-archived-backup/`（`cordis.patch.yml` 使用 `dshHomePath(...)` 求值；沿用此前版本实际使用的目录名，旧备份直接可见）；
* 每个备份目录内写 `dsh-archive-session.json` sidecar（原路径 / 标题 / 工作区记账），恢复时按 sidecar 移回原处并回填工作区；
* 无 sidecar 的目录按「旧格式」备份列出：可删除，不可恢复（原始位置无从得知），界面上标注并禁用恢复按钮。

## 卸载与残留（诚实说明）

* **本插件会移动会话目录**（备份 = 把会话目录移入备份夹），这是核心功能而非残留；备份位置已在归档面板顶部提示中明示；
* **卸载不会自动恢复已备份会话**：备份夹 `$DSH_HOME/sessions-archived-backup/` 及其中的会话目录会保留。请**先在备份区「全部恢复」再卸载**；
* 卸载后不产生其他文件残留：会话数据仍由官方持久化管理；归档集/工作区记账走官方 storageDomain（卸载时已是「已备份 = 已从工作区 detach」的一致状态），本插件不写官方目录之外的任何隐藏状态；
* 若已卸载且仍有备份未恢复：重装本插件即可继续使用恢复功能，或按 sidecar 中的 `originalPath` 手动移回目录（工作区归属需重装后由插件回填）。

## 本机实测记录（2026-08-29）

* 隔离冒烟（当前 dsh 0.1.2-alpha.1，备份夹经 config 覆盖指向真实 `sessions-archived-backup`）：`GET /api/archive-session/backups` 返回 88 条，全部为旧格式（legacy 标记）；`POST /api/archive-session/backup-delete` 对不存在 id 返回 404 `UNKNOWN_BACKUP`。
