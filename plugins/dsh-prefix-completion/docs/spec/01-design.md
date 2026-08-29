# 01 · 详细设计 — dsh-prefix-completion

> 起点为零代码；seam 选择以本文件《seam 查证》为准，未查证项标注待查证，开工前补齐。

## 总体架构

* **host half**（Node）：webServer 自有路由 + 上游转发 + 凭据解析；
* **client half**（浏览器，M2）：dock 建议条，esbuild 单文件 bundle；
* 通信只走 host 路由 `POST /api/prefix-completion/complete`（client 不 import Node 模块，host 不 import 浏览器 API）。

## 插件契约合规（dsh 规范）

* 入口 export `name` / `inject` / `apply`；`inject` 只声明硬依赖（webServer）；
* 副作用在 `apply` 内注册并配 `ctx.effect` 清理（路由注销）；
* 只用公开 seam；确需包装时保持签名与 `this` 语义、可逆恢复、记录适配的 dsh 版本；
* 不硬编码 dsh 内部目录布局；组合行 `cordis.patch.yml` 按官方 bundle patch 结构。

## seam 查证（dsh ≥ 0.1.1-rc.2，本机 checkout 实测）

| seam | 契约 | 证据 | 结论 |
|---|---|---|---|
| 路由注册 | `ctx.webServer.register(route: { kind: 'exact'|'prefix', path, handler(req,res): void|Promise<void> }): () => void`；重复 (kind,path) 抛错；返回注销函数 | packages/host/webserver/src/index.ts:108-115 | **公开 seam** ✓ |
| 凭据 | `ctx.credentials.resolve(ref: CredentialRef): Promise<{ value, source } | undefined>`；ref 由 `credentialRef(name)` 构造（名称须匹配 /^[A-Za-z_][A-Za-z0-9_]*$/）；实时读勿缓存 | packages/credentials/credentials/src/index.ts:190、115-120、26-31 | **公开 seam** ✓，key 只经此解析 |
| 会话校验 | `ctx.sessions.get(id): Session | undefined`（仅当前进程内存的 live 会话；持久化/历史回放另走 persistence 包） | packages/core/session/src/index.ts:1055-1057 | **公开 seam** ✓，注意内存表边界 |
| 附件/输入 | 与 vision 插件共用 `ctx.attachments.readImage`（见 vision spec 01） | packages/attachment/attachment/src/index.ts:108 | 本插件 M2 若有图片需求再接入 |

## host half：转发路由

### 请求语义

* 只受理 `POST /api/prefix-completion/complete`，其余 404；
* 校验：`sessionId` 命中 sessions 服务（否则 403/503）、`prompt` 非空且 ≤ `MAX_PROMPT_CHARS`（拟定 32k，否则 400）、请求体 ≤ `MAX_BODY_BYTES`（64 KB）；
* 凭据：`ctx.credentials.resolve('DEEPSEEK_API_KEY')`，缺失 401；
* 转发：`POST {baseURL}/chat/completions`，body `{ model, messages, max_tokens }`；`messages` 由最近对话历史 + 最后一条 assistant 前缀（`prefix: true`）构造（见 `buildChatPrefixMessages`）；
* 生命周期：超时（`REQUEST_TIMEOUT_MS` 30s）+ 客户端 `close` 即 `AbortController.abort()`。

### 配置

* 插件设置分节：`baseURL`（默认 https://api.deepseek.com/beta）/ `model` / `maxTokens` / `apiKeyEnv`；key 值仍只经 credentials，不进设置明文。

### 错误映射（纯函数，可单测）

* 上游错误/超时/断连 → 错误码表（`BAD_BODY` / `INVALID_PROMPT` / `UNKNOWN_SESSION` / `MISSING_CREDENTIAL` / `UPSTREAM_ERROR` / `TIMEOUT` 等）+ 用户可读提示。

## client half：dock 建议条（M2）

### 触发与作废（核心状态机，纯函数可单测）

* **触发**：草稿变更后停顿 ≥ `TRIGGER_PAUSE_MS`（拟定 400ms，可配置）且草稿非空；
* **不触发**：IME 组合态（compositionstart/end 之间）、已有建议在飞、草稿为空；
* **作废**：继续输入、光标移动、发送、采用、超时未采用；
* **防陈旧**：对齐 dsh 官方草稿修订号机制——请求时快照 `draftRev`，响应回来比对修订号，过期即丢弃（官方语义即 CAS：stale draftRev ⇒ 整个动作 no-op，见 packages/client/ui-input-trigger/src/types.ts:44-48）；同一草稿只保留一个在飞请求。

### 展示与采用

* dock 在输入框附近不遮挡；多条建议键盘（↑↓ Tab）切换；采用 = 追加进草稿（不发送）；失败静默降级为「无建议」。

## 通信协议

```json
POST /api/prefix-completion/complete
{ "sessionId": "...", "prompt": "草稿前缀" }

200 { "suggestions": ["候选1", "候选2"] }
4xx/5xx { "error": { "code": "...", "message": "..." } }
```

## 安全与鲁棒性

* API key 只在 host half，不进浏览器、不进日志；日志不输出 prompt 全文（截断/脱敏）；
* client 渲染建议一律转义；上游请求全部带 AbortController；定时器/轮询在作废与卸载时清理；
* 上游不可达/限流 → 按错误映射给可读提示，不悬挂。

## 风险与边界

* **对话前缀续写 Beta 接口稳定性**：字段/限额可能变化 → 转发层薄封装 + 错误映射兜底，随官方文档跟进；
* **输入法组合态**：中文 IME 是触发误报高发区，composition 压制列入 M2 验收；
* **sessions 内存表边界**：`sessions.get(id)` 只覆盖当前进程 live 会话——宿主重启后旧 sessionId 校验会落空，需设计为「未命中即拒绝并提示刷新页面」，不做静默放行。
