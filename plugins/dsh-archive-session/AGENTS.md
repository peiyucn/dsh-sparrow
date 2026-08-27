# 项目指令 — dsh-archive-session（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记本插件专属约束与 seam 特例。

## 项目概况

DSH Web 插件：归档会话管理 —— 侧边栏 footer 动作区一个入口按钮 + 弹窗列出轻归档会话。已实现：轻量标题（路线 A，短 TTL 缓存 `sessionQuery.readTitleSnapshots`）、备份（可逆）、删除（不可逆）、备份恢复。

> 入口槽位查证结论（dsh ≥ 0.1.1-rc.2）：`ui-workspace` 没有可注入的工具栏 slot；采用 `ui-sidebar` 公开 slot `sidebar.footer.action`（`packages/client/ui-sidebar/src/client/index.ts:52`）。

## seam 特例（需项目 owner 认可，已定案）

* **允许**：直接移动（备份档，可逆）或删除（删除档，不可逆）「会话日志目录」。当前只对 `SessionPersistence.locate(meta)` 返回 `kind: 'jsonl'` 且父目录明显为单会话目录的路径执行；其他后端返回 `BACKEND_UNSUPPORTED`。
* **边界**：
  * 备份档只移动（移入插件备份夹，默认 `$DSH_HOME/dsh-archive-session-backup/`）；删除档允许 `rm`，并须输入完整会话标题强确认。
  * 动作前二次确认；活动会话：`agent.cancel({kind:'hook'})` → `agent.whenIdle()` → `sessions.flush()` → `agent.ctx.fiber.dispose()`，确认会话已从 live store 卸载后再移 / 删。
  * 动作后同步 `workspace` 记账：`WorkspaceEntity.detachSession()`；归档集经 `workspaceDomainSpec` + `ctx.storageDomain` 更新（`domain/changed` 会触发 api-proxy 广播 `host/archived-sessions-changed`，插件不手发帧）。
  * 备份目录写 `dsh-archive-session.json` sidecar（原路径 / 标题 / workspaceIds），恢复时移回并 `WorkspaceEntity.attachSession()`。
* **仍禁止**：monkey-patch 核心、读 / 改会话日志内容、动会话目录以外的内部文件（附件 / 存储域 / 凭据等一律走官方服务）。

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块。
* 一切副作用在 apply 内注册并配 `ctx.effect` 清理；不泄漏定时器 / watcher / AbortController。
* 路线 A 包装 / 替换 `sessionReferenceResolver` / `sessionQuery` 时保持原签名与 `this` 语义、可逆恢复，并记录所适配 dsh 版本。

## 测试

* Node 内置 test runner，用例在 `test/*.test.mjs`；命名 `<模块名>.test.mjs`，AAA 结构，it 描述「输入条件 应该 期望结果」。
* 清理链纯逻辑（停会话判定、flush、移动 / 删除、记账清理、同步帧、确认强度判定）必须可单测。
