# dsh-archive-session

DeepSeek Harness（DSH）Web 插件 —— 归档会话管理（dsh-sparrow 合集成员）。

与官方「轻归档」互补：官方把会话从侧边栏藏起来；本插件在**侧边栏 footer 动作区**加一个入口按钮（查证结论：`ui-workspace` 工具栏没有可注入 slot，故采用公开 slot `sidebar.footer.action`），点开弹窗列出所有轻归档会话——

* **轻量标题（`@` 仍可拉回）**：包装 `sessionQuery.readTitleSnapshots` 加短 TTL 缓存（路线 A），默认开启。
* **备份（`@` 不可达，可逆）**：把会话目录移到插件备份夹，`@` / 列表不再出现；可移回恢复。
* **删除（`@` 不可达，不可逆）**：`rm` 会话目录，不可恢复；不可逆警示 + 输入完整标题强确认。

主 UI 保持干净，只多一个按钮。

**状态：🚧 M1+M2 已实现** —— 适配 dsh ≥ 0.1.1-rc.2；设计文档见 [docs/spec/](docs/spec/)。

## 本地验证

```bash
npm run verify
```

## 备份位置与恢复

* 默认备份夹：`$DSH_HOME/dsh-archive-session-backup/`（`cordis.patch.yml` 使用 `dshHomePath(...)` 求值）；
* 每个备份目录内写 `dsh-archive-session.json` sidecar（原路径 / 标题 / 工作区记账），恢复时按 sidecar 移回原处并回填工作区。
