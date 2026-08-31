# 01 · 设计 — dsh-file-manage

> 本文是 seam 查证 + 架构提案；「待查证」条目未确认，开工前需补查。

## DSH seam 查证结论（已 grep 源码确认，dsh 0.1.2-alpha.3，HEAD dd6322d604）

* **官方 Files API 客户端（公开导出）**：`@deepseek-ai/dsh-llm-deepseek` 导出 `DeepSeekFilesClient`（`list` / `retrieve` / `delete` / `upload`）与类型、常量（`MIN/MAX_FILE_EXPIRY_SECONDS`、`MAX_STORED_FILE_COUNT` = 10000、`MAX_STORED_FILE_BYTES` = 25GiB），`packages/llm/llm-deepseek/src/files-api.ts` + `index.ts`。list 返回 `{ data, firstId, lastId, hasMore }` 游标分页。
* **无批量删除**：官方 client `delete(fileId)` 只收单个 id（`files-api.ts:250`）；官方文档 OpenAI / Anthropic 兼容两套均只有单条 `DELETE /files/{id}`（2026-09-01 复核）。
* **连接事实解析**：官方 adapter 每请求解析 `{ baseURL, apiKey }`（`adapter.ts`：设置节 `llm-deepseek` 的 `baseURL` / `apiKeyEnv` → `ctx.credentials` 解析，缺省回退 $DEEPSEEK_BASE_URL / DEEPSEEK_API_KEY 环境）。插件 host 侧照同一路径解析（正路 seam：`ctx.settings` + `ctx.credentials`），与 chat-fim 直连模式一致。
* **删除安全性（关键查证）**：引用已删 file_id 的 chat 请求，官方 adapter 有失效重试——`adapter.ts` staleFile 分支：provider 报错命中 `providerRejectedFileId(detail)` → `files.invalidate(...)` 失效索引映射 → `fileAttempt === 0` 时重试一次（重试走图片解析，索引已失效故重新上传）。即删除文件后旧会话再次引用会**自动重新上传**（付一次重试与重新上传的开销）。极端边界：provider 报错 detail 不含 file_id 时无法定位失效映射（警示文案保守处理）。
* **客户端入口**：`sidebar.footer.action` 公开 slot（`ui-sidebar/src/client/contract/slots.ts`；archive-manage 已用同一入口）。

## 架构（对齐 dsh-archive-manage，完全无状态）

* **host half**：REST 路由，内部用官方 `DeepSeekFilesClient`；插件零本地持久化（无 sidecar、无任务表）。
  * `GET /api/file-manage/list?after&limit&order` → 单页（转发官方 list，透传游标）
  * `DELETE /api/file-manage/:id` → 删除单条（转发官方 delete）
* **client half**：`sidebar.footer.action` 入口按钮 + 弹窗面板（列表 / 翻页 / 删除 / 复制 file_id），样式注入；状态一致、可打断。
* **纯逻辑抽 `src/files.ts`**：分页参数归一化、文件对象格式化（大小人读 / 时间显示 / 过期判定）、`dsh-` 判定、确认强度判定——全部可单测。

## 交互细节（提案）

* 列表行：文件名 + `dsh-` 角标 + 大小 / 时间 / 到期 + 复制 file_id + 删除按钮。
* 分页：每页 20 条（owner 拍板），「加载更多」按 has_more 驱动。
* 删除单条：确认弹窗；`dsh-` 文件文案「此文件由 DSH 自动上传，可能被会话引用；删除后再次引用时官方会自动重新上传（可能稍慢）」。
* 空态：无文件时显示空列表说明（配额相关提示）。
* 错误分类：官方 `DeepSeekFilesError` 已分类（AUTH / RATE_LIMIT / SERVER / FILES_API），面板按类提示。

## seam 特例（写入插件 AGENTS.md）

* 凭据只经 `ctx.credentials` 解析，不落日志、不进浏览器。
* 插件只调官方公开端点（list / delete 单条），不做任何内部文件操作、不写官方上传索引。

## 待查证 / 开放问题

1. `ctx.settings` 读取 `llm-deepseek` 设置节的正确姿势（baseURL / apiKeyEnv）开工时补查。
2. provider 报错 detail 不含 file_id 时官方失效重试的边界——不影响实现，只影响警示文案措辞。

## 适配版本基线

本机 dsh checkout：`C:\Users\DJ028191\.dsh-launcher-panel\source`（release/dsh-0.1.2-alpha.3）。开工时记录所适配 dsh 版本与导出行号复核。
