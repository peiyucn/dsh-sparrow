# 02 · 路线图 — dsh-file-manage

## M1 · 查证与定案

* [x] 查证：官方 Files API 客户端导出与分页、入口 slot、删除安全性（adapter staleFile 失效重试）、官方无批量删除端点（见 01）。
* [x] 定案：范围简化——只做清单 / 单条删除 / 复制 file_id；无会话归属、无 sidecar、无面板上传、无全部清理；列表每页 20 条（owner 拍板）。
* [ ] 补查：`ctx.settings` 读取 `llm-deepseek` 节。

## M2 · 实现

* [ ] 脚手架 + host 路由（list / delete）+ 纯逻辑 `src/files.ts` + 单测；`npm run verify`。
* [ ] client 面板：入口按钮、游标翻页列表、删除确认（`dsh-` 提示）、复制 file_id。
* [ ] 文档：README / CHANGELOG / 插件 AGENTS.md（seam 特例）。

## M3 · 验证与发布

* [ ] dsh checkout 热更验证（列表分页 / 删除 / 卸载无痕）。
* [ ] 发布流程按根 AGENTS.md（alpha → owner 验证 → 转正）。
