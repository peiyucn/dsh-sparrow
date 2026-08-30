# dsh-vision-subagent

纯文本主模型（如 deepseek-v4-pro）会话中，图片交给官方视觉模型（deepseek-v4-flash-vision-exp）处理，主模型保持对话大脑。

**状态：🚧 M1 已实现** —— 门禁放行（可逆包装 `resolveModelInfo`）+ `vision_read` 工具 + 结构化报告缓存；适配 dsh ≥ 0.1.1-rc.2。设计文档见 [docs/spec/](docs/spec/)。

## 本地验证

```bash
npm run verify
```

## M1 行为

* 仅对配置的文本路由抹除显式不含 image 的 `inputModalities`（放行贴图门禁），卸载时恢复；
* 主模型调用 `vision_read` → 从会话事件反查图片引用（归一化 + 唯一前缀匹配，占位符里的截断哈希可直接传）→ `ctx.attachments.readImage` 校验 → **直连 `ctx.llm`** 指定官方 vision 模型读图（不再走子代理）；默认 `maxTokens: 8192` + `visionReasoningEffort: low`，避免思考把输出上限烧光导致正文截断；只有思考文本、没有正文时以明确错误返回，不再把思考过程当报告；
* 报告按 attachmentId 进程内 LRU 缓存；失败以工具错误返回，不悬挂。

## 性能实测（2026-08-29）

* 直连视觉模型：读图 + JSON 输出 **2.2s**（纯文本 0.8s）；
* 旧实现走 `ctx.subagents`：**46.3s**（子代理 agent 循环 4 步 + 工具误用 + 系统提示 + 思考开销）——已弃用。
