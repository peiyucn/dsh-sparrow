# 00 · 插件概览 — dsh-archive-manage

> dsh-sparrow 合集成员。本文是需求范围与验收边界；详细设计见 01-design.md，路线图见 02-roadmap.md。

## 定位

与官方「轻归档」配合，集中管理已归档的会话：在侧边栏 footer 加一个入口按钮，点开弹窗列出所有归档会话，每行提供**三档操作**——轻量标题（`@` 仍可拉回，已退役）、备份（`@` 不可达，可逆）、删除（`@` 不可达，不可逆）。与官方「轻归档」互补，不替换官方归档菜单。

## 痛点与根因（已查证）

* **`@` 慢根因**：`sessionReferenceResolver.listCandidates` 在查询非空时对「所有」持久化会话解码（`inspected = records`，`packages/context/session-reference/src/index.ts:173-182`）；`readTitleSnapshots` 对每个候选经 `projectMany` 全量 `inspectPersisted`（读全文件 + zstd 解码 + 扫全部 JSONL，`packages/session-query/session-query/src/corpus.ts:268-288`），只为折叠标题。
* **归档 ≠ 释放**：归档只写入 `workspace` 域 `archivedSessionIds`（`packages/workspace/workspace/src/index.ts:244`），日志留在 `~/.dsh/sessions/`；`session-query` / `session-reference` 均不读归档集，归档会话照解码。
* **无官方「删除会话日志」API（已复核）**：客户端 workspace 接口无 deleteSession，`session.*` 接口无 delete；`SessionPersistence` 无 delete。社区插件（dsh-plugin-session-delete 等）用「停会话 → 删日志目录 → 清理记账 → 同步帧」实现，但有直接删文件与半删除残留风险。本插件三档中「备份 / 删除」直碰会话日志目录，边界见 01 与插件 AGENTS.md。

## 需求范围（做什么 / 不做什么）

**做**：

* 侧边栏 footer 一个入口按钮 + 弹窗列出归档会话（含 live / running 状态）。
* 每行三档操作：
  * **轻量标题（`@` 仍可拉回，路线 A，公开 seam，已退役 2026-08-30）**：候选标题走短 TTL 缓存 / 轻量读取，`@` 即使会话多也不卡——官方投影缓存已覆盖，退役。
  * **备份（`@` 不可达，可逆）**：把会话目录移到插件备份夹，`@` / 列表不再出现；可移回恢复。
  * **删除（`@` 不可达，不可逆）**：`rm` 会话目录，不可恢复；不可逆警示 + 强确认。
* 与官方「轻归档」互补，不替换官方归档菜单。

**不做**：

* 不碰会话目录以外的内部文件（附件 / 存储域 / 凭据等一律走官方服务）。
* 不实现「取消归档」：除非 `workspace` 有公开 unarchive API（待查证），否则经 domain 写或同备份 / 删除的边界内处理（见 01）。
* 不 monkey-patch 核心；不替换会话模型。

## 验收标准（提案，待评审）

### 入口与弹窗

* 侧边栏 footer 仅多一个入口按钮；点开弹窗列出全部归档会话。
* 弹窗状态与 `workspace` 域一致（无乐观置灰、可打断）；关闭 / 重开不残留状态。

### 轻量标题（路线 A，已退役 2026-08-30）

* `@` 候选解码不再逐键全量重扫；连续输入命中缓存 / 轻量路径。
* 不改变候选结果集与排序；不泄漏定时器 / AbortController。
* 纯逻辑（缓存键、TTL、失效规则）有 `test/*.test.mjs` 单测。

### 备份（可逆）

* 移动前二次确认（展示标题 + 可逆说明）；未释放的会话（本次 dsh 运行中驻留）无法卸载，面板在归档区内分组置灰操作，下次启动 dsh 后才可备份。
* 移走后 `@` / 侧边栏不再出现；`workspace` 记账与归档集同步清理（经 `workspaceDomainSpec` + `ctx.storageDomain`），不残留「未分组」行。
* 移入插件备份夹而非硬删；支持移回恢复；失败路径状态诚实。

### 删除（不可逆）

* 删除前「不可逆」警示 + 更强确认（如输入会话标题）；未释放的会话同样置灰，下次启动 dsh 后才可删除。
* 删后 `@` / 侧边栏不再出现；记账与归档集同步清理，不残留「未分组」行。
* 不碰会话目录以外的任何内部文件。

## 退役条件

官方原生支持归档 / 删除会话管理、或 `@` 不再全量解码会话日志后，本插件从合集中退役。
