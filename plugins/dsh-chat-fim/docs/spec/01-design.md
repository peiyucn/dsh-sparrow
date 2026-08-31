# 01 · 详细设计 — dsh-chat-fim

> 起点为零代码；seam 选择以本文件《seam 查证》为准，未查证项标注待查证，开工前补齐。

## 总体架构

* **host half**（Node）：webServer 自有路由 + 上游转发 + 凭据解析；
* **client half**（浏览器，M2）：dock 建议条，esbuild 单文件 bundle；
* 通信只走 host 路由 `POST /api/chat-fim/complete`（client 不 import Node 模块，host 不 import 浏览器 API）。

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

* 只受理 `POST /api/chat-fim/complete`，其余 404；
* 校验：`sessionId` 命中 sessions 服务（否则 403/503）、`prompt` 非空且 ≤ `MAX_PROMPT_CHARS`（拟定 32k，否则 400）、请求体 ≤ `MAX_BODY_BYTES`（64 KB）；
* 凭据：`ctx.credentials.resolve('DEEPSEEK_API_KEY')`，缺失 401；
* 转发：`POST {baseURL}/completions`（FIM 补全 Beta），body `{ model, prompt, max_tokens, stop, temperature }`；`prompt` 由最近对话历史转成的「用户：/助手：」说话人文本 + 草稿（最后一个「用户：」开头）构造（见 `buildFimPrompt`）；FIM 直接续写文本本身、没有角色语义，天然站在用户角度；`stop` 序列 `\n用户：` / `\n助手：` 防止模型续写下一位说话人；
* 补全模型（2026-08-30）：**跟随主模型**（`resolveFimModel`）——主模型为 deepseek-official 的 v4-pro/v4-flash 时用主模型补全（计费随之），vision-exp / 未知 / 非官方回退配置默认 `model`；依据：官方 API schema 只列 v4-pro，但直连实测 flash 亦可（见 README 实测记录）；
* 多建议：FIM 接口无 `n` 参数，按 `suggestionCount`（默认 1）并行请求、温度错开采样（base + index×0.4，封顶 2）；`allSettled` 部分失败保留成功建议；
* 采样：`temperature` 默认 **0.3**（2026-08-30 A/B 实测：1.0 漂移明显、会复读最近一条用户消息，0.3 聚焦稳定；上游已废弃 frequency/presence penalty，不可用）；
* 生命周期：超时（`REQUEST_TIMEOUT_MS` 30s）+ 客户端 `close` 即 `AbortController.abort()`。

### 配置

* 插件设置分节：`baseURL`（默认 https://api.deepseek.com/beta）/ `model` / `maxTokens` / `apiKeyEnv` / `suggestionCount` / `temperature`；key 值仍只经 credentials，不进设置明文。

### 错误映射（纯函数，可单测）

* 上游错误/超时/断连 → 错误码表（`BAD_BODY` / `INVALID_PROMPT` / `UNKNOWN_SESSION` / `MISSING_CREDENTIAL` / `UPSTREAM_ERROR` / `TIMEOUT` 等）+ 用户可读提示。

## client half：dock 建议条（M2）

### 触发与作废（核心状态机，纯函数可单测）

* **触发**：草稿变更后停顿 ≥ 400ms（客户端常量 `PAUSE_MS`，非插件配置），且**草稿形态门控通过**（`shouldTriggerFim`，2026-08-30 实测驱动，同日晚改为**按草稿内容自适应的通用规则**——不做 zh/en 硬切换，各语言体验一致）：
  * trim 后达到最短长度：含 CJK 字符的草稿 ≥ `MIN_TRIGGER_DRAFT_CHARS`（8 字符）；纯拉丁草稿 ≥ `MIN_TRIGGER_DRAFT_CHARS_LATIN`（3 字符，按词计），上下文过短不触发；
  * 末尾非句末标点（`。！？.!?;；`）——句末已完整，FIM 会续出新一句而不是接话（实测：草稿「还有个问题，fim接口是计费的么？」被续成「claude code好像没有fim呢…」，衔接不上）；
  * 尾随空格一律放行：英文词后空格、中文空格分词习惯下，空格后正是预测下一段文字的位置；
  * 含 CJK 的草稿若正停在夹入的英文单词中间（末尾两字符都是 `[A-Za-z0-9]`）不触发（续半词质量差）；其余形态——含纯拉丁单词中间——都触发；
* **不触发**：IME 组合态（compositionstart/end 之间）、已有建议在飞、形态门控未过；
* **作废**：继续输入、光标移动、发送、采用、超时未采用；
* **防陈旧**：对齐 dsh 官方草稿修订号机制——请求时快照 `draftRev`，响应回来比对修订号，过期即丢弃（官方语义即 CAS：stale draftRev ⇒ 整个动作 no-op，见 packages/client/ui-input-trigger/src/types.ts:44-48）；同一草稿只保留一个在飞请求。

### 展示与采用

* 建议以官方 @ 候选菜单同款悬浮卡展示在输入框上方（`conversation.input.overlay` 槽 + MenuDropdown 视觉 token）；与官方触发菜单（`[data-trigger-menu]`）互斥，详见 03-menu.md；
* 采用 = 追加进草稿（不发送）：Tab 或 mousedown 点选；Esc 丢弃；失败静默降级为「无建议」（错误提示挂在开关旁）。

## 通信协议

```json
POST /api/chat-fim/complete
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
