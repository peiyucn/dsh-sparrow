# 项目指令 — dsh-archive-session（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记本插件专属约束与 seam 特例。

## 项目概况

DSH Web 插件：归档会话管理 —— 工作区工具栏一个入口按钮 + 弹窗列出轻归档会话；每行三档操作：轻量标题（`@` 仍可拉回，路线 A）、备份（`@` 不可达，可逆）、删除（`@` 不可达，不可逆）。

## seam 特例（需项目 owner 认可，已定案）

* **允许**：直接移动（备份档，可逆）或删除（删除档，不可逆）「会话日志目录」（`SessionPersistence.locate(meta)` 拿到的路径，`~/.dsh/sessions` 下）。理由：DSH 无公开「删除 / 移动会话日志」API。
* **边界**：
  * 备份档只移动（移入插件备份夹，默认 `~/.dsh/dsh-archive-session-backup/`）；删除档允许 `rm`，但须「不可逆」警示 + 更强确认（如输入会话标题）。
  * 动作前二次确认；活动会话先停 + flush 再移 / 删，防 dispose 回写重建。
  * 动作后必须同步清理 `workspace` 记账与归档集（经 `workspaceDomainSpec` + `ctx.storageDomain`），并广播 `host/archived-sessions-changed` 同步客户端；不留「未分组」脏行。
  * 备份档支持移回恢复。
* **仍禁止**：monkey-patch 核心、读 / 改会话日志内容、动会话目录以外的内部文件（附件 / 存储域 / 凭据等一律走官方服务）。

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块。
* 一切副作用在 apply 内注册并配 `ctx.effect` 清理；不泄漏定时器 / watcher / AbortController。
* 路线 A 包装 / 替换 `sessionReferenceResolver` / `sessionQuery` 时保持原签名与 `this` 语义、可逆恢复，并记录所适配 dsh 版本。

## 测试

* Node 内置 test runner，用例在 `test/*.test.mjs`；命名 `<模块名>.test.mjs`，AAA 结构，it 描述「输入条件 应该 期望结果」。
* 清理链纯逻辑（停会话判定、flush、移动 / 删除、记账清理、同步帧、确认强度判定）必须可单测。
