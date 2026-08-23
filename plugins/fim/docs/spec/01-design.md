# 01 · 详细设计 — dsh-fim

## 总体架构

* **host half**（Node，`src/host.ts`）：webServer 路由 + 上游转发 + 凭据解析；
* **client half**（浏览器，M2，`src/client/`，esbuild 单文件 bundle）：dock 建议条；
* 通信只走 host 自有路由 `POST /api/fim/complete`（架构约束：client 不 import Node 模块，host 不 import 浏览器 API）。

## 插件契约合规（dsh 规范）

* 入口 export `name` / `inject` / `apply`；`inject` 只声明硬依赖（当前 `webServer`）；
* 副作用在 `apply` 内注册并配 `ctx.effect` 清理（路由注销）；
* seam 只用公开契约：`ctx.webServer.register`（路由）、`ctx.get('sessions'|'credentials')`（软依赖、降级）；
* 组合行 `cordis.patch.yml` 按官方 bundle patch 结构。

## host half：转发路由

### 现状（v1 骨架，已实现）

* 注册 prefix 路由 `/api/fim`，只受理 `POST /api/fim/complete`，其余 404；
* 请求校验：`sessionId` 必须命中 sessions 服务（否则 403/503）；`prompt` 非空且 ≤ `MAX_PROMPT_CHARS`（32k，否则 400）；
* 请求体大小上限 `MAX_BODY_BYTES`（64 KB）；
* 凭据：`ctx.credentials` 解析 `DEEPSEEK_API_KEY` 优先，环境变量兜底；缺失 401；
* 上游转发：`POST {baseURL}/completions`，body `{ model, prompt, suffix?, max_tokens }`；
* 生命周期：`REQUEST_TIMEOUT_MS`（30s）超时 + 客户端 `close` 即 `AbortController.abort()`；
* 配置当前为内联 `DEFAULTS`（baseURL / model / maxTokens / apiKeyEnv）。

### M1 收尾待办

* **配置化**：`DEFAULTS` 内联 → 插件设置分节（Config schema + settings），key 仍只经 credentials；
* **错误映射表**（纯函数）：上游错误/超时/断连 → 用户可读提示；
* **响应协议**：`{ suggestions: string[] }` 与 `{ error: { code, message } }` 定稿；
* **单测**：请求校验、错误映射、请求体解析（AAA 风格，`test/*.test.mjs`）；
* **本地验证**：`dev.patch.yml` + dsh source checkout（本机 `C:\Users\DJ028191\.dsh-launcher-panel\source`）；修复 tsconfig 类型路径（现指向已失效的 npx 缓存，需改为当前 `@deepseek-ai/cordis` 所在位置）。

## client half：dock 建议条（M2）

### 触发与作废（核心状态机，纯函数可单测）

* **触发**：草稿变更后停顿 ≥ `TRIGGER_PAUSE_MS`（拟定 400ms，可配置）且草稿非空；
* **不触发**：IME 组合态（`compositionstart` → `compositionend` 之间）、已在建议中、草稿被清空；
* **作废**：继续输入、光标移动、发送消息、采用建议、超时未采用；
* **防陈旧**：响应带回请求序号（或按草稿快照比对），过期响应直接丢弃。

### 展示与采用

* 建议条 dock 在输入框附近，不遮挡输入；多条建议键盘（↑↓ Tab）可切换；
* 采用 = 把建议文本追加进当前草稿（光标处），不发送；
* 失败/超时静默降级为「无建议」，不打断输入。

## 通信协议（host ↔ client）

```json
POST /api/fim/complete
{ "sessionId": "...", "prompt": "草稿前缀", "suffix": "可选后缀" }

200 { "suggestions": ["候选1", "候选2"] }
4xx/5xx { "error": { "code": "...", "message": "..." } }
```

## 安全与鲁棒性

* API key 只在 host half 使用，不进浏览器、不进日志；日志不输出 prompt 全文（截断/脱敏）；
* client 渲染建议一律转义（HTML 注入面）；
* 上游请求全部带 AbortController；轮询/定时器在作废与卸载时清理；
* 上游不可达/限流 → 按错误映射给可读提示，不悬挂。

## 风险与边界

* **FIM Beta 接口稳定性**：接口字段/限额可能变化 → 转发层薄封装、错误映射兜底，随官方文档跟进；
* **输入法组合态**：中文 IME 是触发误报高发区，必须用 composition 事件压制（列入 M2 验收）；
* **多建议并发**：同一草稿只保留一个在飞请求（新请求取代旧请求）。
