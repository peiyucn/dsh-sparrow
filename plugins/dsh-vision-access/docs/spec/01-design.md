# 01 · 详细设计 — dsh-vision-access

> seam 结论均来自本机 dsh checkout（≥ 0.1.1-rc.2，C:\Users\DJ028191\.dsh-launcher-panel\source）的源码查证，file:line 见各表。

## 架构总览（三段式）

```
贴图 → [1 放行] 文本路由的 inputModalities 抹除(可逆包装) → 图片进入会话
     → [2 读取] 主模型调用注入的 vision_read 工具 → 工具内:
         ctx.attachments.readImage(ref) 校验字节 → ctx.llm.prepareCall(官方 vision 模型, low 思考, 8192 上限)
         → prepared.stream 收流 → resolveVisionOutput 截断兜底 → 结构化报告
     → [3 回传] 报告以文本 ContentBlock 回传主模型 → 主模型基于报告作答
```

主模型永远是大脑；vision 模型只做感知。与 dsh-image-subagent 的「prompt 软约束 + 文件体操」、dsh-periscope 的「整轮切 wire model」差异见 00-overview。

## seam 查证表（全部公开 seam，无 internal 包装）

| 环节 | 契约 | 证据 | 结论 |
|---|---|---|---|
| 图片数据 | 消息 image block: `{ type:'image', attachment: ImageAttachmentRef }`；`readImage(ref, signal?) → { ref, data: Uint8Array }` 取字节 | packages/llm/llm/src/types.ts:71-75；packages/attachment/attachment/src/index.ts:108 | **公开 seam**，不硬编码 ~/.dsh/attachments 布局 |
| 门禁放行 | RPC 层拒绝发生在 `resolveModelInfo` 返回的 `inputModalities` 显式不含 image 时；`resolveModelInfo` 是公开属性，可逆包装 | packages/api/session-controller/src/commands.ts:314；packages/llm/llm/src/index.ts:646-652 | 包装公开 seam（抹除文本路由的 inputModalities，可逆、只对配置的文本路由生效） |
| 工具注册 | `ctx.tools.register(defineTool({ name, description, parameters, output:{ schema, render }, execute }))`；结果以 ContentBlock[] 回传 | packages/core/tools/src/index.ts:137-140、221-288、1037-1062；官方实例 packages/subagent/tool-subagent/src/index.ts:306-440 | **公开 seam**，委托是机制不是 prompt 软约束 |
| 视觉模型直连 | `ctx.llm.prepareCall({ provider, model, maxTokens, temperature, reasoningEffort })` → `prepared.stream({ ...prepared.config, messages, signal })`（必须原样展开 `prepared.config`，否则 `INVALID_PREPARED_CALL`）；流块收 `text-delta` / `reasoning-delta` | packages/llm/llm/src/index.ts:889-919、call-config.ts:46-54 | **公开 seam**；实测直连 2.2s vs 子代理 46.3s，已弃子代理 |
| 按 agent 屏蔽工具 | `agent/request` waterfall 里 `agent.ctx.tools.restrict({ deny: ['vision_read'] })`（返回解除器） | packages/subagent/tool-subagent 的官方先例 | **公开 seam**；主模型非 deepseek-official 时对该 agent 生效 |
| 预设（可选增强） | `ctx.agentPresets`：list/resolve/mount/composeFrom/copy/remove/recompose；改模型应走 agentOptions 而非改 preset 文件 | packages/preset/agent-presets/src/index.ts:69-73、199-485 | 公开 seam；M1 不用，M2 可选 |
| 流介入（可选增强） | `llm/stream` waterfall：读 options.messages 判定含图；deep-frozen 只读，必须构造新 messages 传给 next（语义需开工实测） | packages/llm/llm/src/index.ts:53-65；官方包装先例 packages/llm/llm/src/invariant.ts:88 | 公开 waterfall；M2 再启用 |
| 会话/凭据（chat-suggest 共用） | `sessions.get(id)`（仅 live 会话）；`credentials.resolve(credentialRef(name))` 实时读勿缓存 | packages/core/session/src/index.ts:1055-1057；packages/credentials/credentials/src/index.ts:190 | **公开 seam** |

## 核心设计

### 1. 放行（只影响配置的文本路由）

* 包装 `ctx.llm.resolveModelInfo`：对「插件配置的 provider+文本模型」且显式声明 `inputModalities` 不含 image 的结果，抹除 inputModalities 字段（undefined = 负能力 → RPC 门禁放行，与 0.1.1 门禁语义一致，即 dsh-image-subagent v0.2.0 的适配策略）；
* 可逆：`ctx.effect` 里注册恢复原函数；只对白名单路由生效，视觉路由与其他插件不受影响；
* 风险备案：这是 seam 包装（非 internal 修改），适配版本记录在 README/CHANGELOG。

### 2. 读取：`vision_read` 工具（机制化）

* 工具定义：`vision_read`，parameters `{ attachmentId: string, question?: string }`，`isConcurrencySafe: true`，`timeoutMs: 120_000`；
* `execute`：由 attachmentId 反查 ImageAttachmentRef（遍历会话事件里的 image block，仿 api-session-controller 的 referencedImage，session-controller/src/commands.ts:572）→ 主模型路由检查（非 deepseek-official 抛「视觉功能已禁用」）→ `ctx.attachments.readImage(ref)` 校验 → `ctx.llm.prepareCall`（默认 `maxTokens: 8192` + `visionReasoningEffort: low`，避免思考烧光输出上限）→ `prepared.stream` 收集 text/reasoning delta → `resolveVisionOutput`（正文优先；只有思考文本 = 截断/异常，抛明确错误，不把思考当报告）→ `parseVisionReport(extractJsonObject(raw), raw)`；
* 输出 schema：结构化报告 `{ summary: string, ocrText?: string, tables?: string[], layout?: string }`，render 转成带标记的文本块回传主模型；
* 按 agent 屏蔽：主模型路由非 DeepSeek 系列时，`agent/request` waterfall 对该 agent `tools.restrict({ deny: ['vision_read'] })`（工具与 UI 都像没有）；切回 deepseek 路由时解除（Map 记录每个 agent 的解除器）；
* **原生视觉主模型屏蔽**（2026-08-30）：主模型自身 `inputModalities` 含 image（如 deepseek-v4-flash-vision-exp）时同样隐藏工具——图片本来直达主模型，经 vision_read 转文字报告是有损的；`execute` 内二次防御：原生视觉主模型调用直接抛「无需视觉通道」；
* 主模型上下文中的占位文本只含 attachmentId + 「如需看图调用 vision_read」——旧方案的「复制文件补扩展名」体操全部删除。

### 3. 缓存与降级

* 报告按 attachmentId（内含 sha256）进程内缓存，上限 N 条；同一图片跨会话/重复贴图不重复读；
* 降级链：官方 vision 模型可用性 → 缓存 → 明确错误（提示检查 vision 模型/配额）；第三方 VLM 仅作可选配置（默认关闭，README 明示隐私）；
* 失败时工具返回 isError 结果文本，主模型可继续作答或提示用户，绝不悬挂。

## 安全与合规

* API key 由 llm 适配层经凭据解析，插件不落明文、不进浏览器；图片字节只流向官方 provider（与主会话同 key 同体系）；
* 副作用全部在 apply 内注册并 `ctx.effect` 清理（路由/工具/包装恢复）；
* 报告文本渲染时转义；不硬编码附件目录布局；不 monkey-patch core。

## 风险与待实测项

1. **llm/stream next(newOptions) 语义**（M2 自动投影才需要）：cordis waterfall 中替换 options 是否全路径允许——开工时以官方 invariant.ts 包装先例 + 实测确认；M1 不依赖它；
2. **思考截断**：视觉模型可能把输出上限烧在 reasoning 上、正文为空——已按 `maxTokens: 8192` + `visionReasoningEffort: low` + `resolveVisionOutput` 明确报错兜底（2026-08-30 实测修复）；
3. **门禁包装的副作用**：抹除 inputModalities 后，`read_image` 等能力门禁对主模型仍应保持拒绝（与 image-subagent 同策略：工具门禁独立于模型声明，需实测）；
4. **成本/延迟预算**：直连视觉调用约 2.2s/次（旧子代理方案 46.3s）；多图合并策略列入 M2。
