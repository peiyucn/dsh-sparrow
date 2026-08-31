# 00 · 插件概览 — dsh-file-session

> dsh-sparrow 合集成员。本文是需求范围与验收边界；详细设计见 01-design.md，路线图见 02-roadmap.md。

## 定位

DeepSeek Files API 云端文件的**可视化管理面板**：侧边栏 footer 一个入口按钮（与 dsh-archive-session 同模式），弹窗列出本 API key 下的全部云端文件，支持单条删除与复制 file_id。只做「看得见 + 删得掉」，不动官方上传与去重逻辑（owner 拍板：不破坏官方初衷）。

## 痛点与根因（已查证）

* DSH 贴图大图走质量阶梯自动上传 Files API 并以 `file_id` 引用（`packages/llm/llm-deepseek` 的 `DeepSeekFileStore` / `serialize.ts`），文件积累在云端（单 key 配额 10000 个 / 25 GiB），**官方没有任何界面**能看清单、删文件、清配额。
* 官方导出 `DeepSeekFilesClient`（upload / list / retrieve / delete，`src/files-api.ts` + `index.ts` 公开导出），插件可直接复用，不经手新凭据。
* **删除安全性（关键查证）**：引用已删 file_id 的请求会触发官方 adapter 的失效重试（`adapter.ts` staleFile 分支：`providerRejectedFileId` → `invalidate` → 重试一次并重新上传），删除文件是安全的。
* **官方无批量删除端点**（已查证：文档 OpenAI / Anthropic 兼容两套均只有单条 `DELETE /files/{id}`；官方 client 的 `delete` 只收单个 fileId）——因此不做「全部清理」。

## 需求范围（做什么 / 不做什么）

**做**：

* 侧边栏 footer 入口按钮 + 弹窗（同 archive-session 模式）。
* 列表：游标翻页（after / limit / order，默认 desc 最新在前）；行内展示文件名、大小（人读）、上传时间（created_at）、到期时间（expires_at，有则显）、file_id（一键复制）；`dsh-` 前缀文件标注「DSH 自动上传」。
* 删除单条：二次确认；`dsh-` 前缀额外说明「删除后再次引用时官方会自动重新上传」。
* 复制 file_id。

**不做**：

* 不做「全部清理 / 批量删除」——官方无批量删除端点，逐条循环的 API 调用成本不可控（owner 拍板）；官方提供批量端点后再补。
* 不做会话归属（sidecar 元数据）——不破坏官方按内容跨会话去重的初衷（owner 拍板）。
* 不做面板上传（DSH 贴图已自动上传；需要时后续版本再补）。
* 不做文件内容预览 / 下载（官方 Files API 无下载端点）。
* 不写官方上传索引 `files-v3.json`；不碰 DSH 其它内部文件。
* 不给 agent 加工具（v1）。

## 验收标准（提案，待评审）

### 入口与弹窗

* 侧边栏 footer 仅多一个入口按钮；弹窗状态一致、可打断、关闭重开不残留。

### 列表

* 游标翻页与官方一致（after / limit / order）；「加载更多」按 has_more 驱动。
* 行信息完整（文件名 / 大小人读 / 上传与到期时间 / file_id 复制）；`dsh-` 角标正确。

### 删除

* 单条删除二次确认，成功后列表即时移除；`dsh-` 提示文案正确。

### 卸载

* 插件无本地持久化状态；卸载后 DSH 行为不受影响。

## 退役条件

官方提供云端文件管理界面 / 删除能力后，本插件退役。
