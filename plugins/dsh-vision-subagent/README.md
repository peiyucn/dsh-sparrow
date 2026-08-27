# dsh-vision-subagent

纯文本主模型（如 deepseek-v4-pro）会话中，图片交给视觉子代理（官方 deepseek-v4-flash-vision-exp）处理，主模型保持对话大脑。

**状态：🚧 M1 已实现** —— 门禁放行（可逆包装 `resolveModelInfo`）+ `vision_read` 工具 + 结构化报告缓存；适配 dsh ≥ 0.1.1-rc.2。设计文档见 [docs/spec/](docs/spec/)。

## 本地验证

```bash
npm run verify
```

## M1 行为

* 仅对配置的文本路由抹除显式不含 image 的 `inputModalities`（放行贴图门禁），卸载时恢复；
* 主模型调用 `vision_read` → 从会话事件反查图片引用 → `ctx.attachments.readImage` 校验 → `ctx.subagents.start` 指定官方 vision 模型读图；
* 报告按 attachmentId 进程内 LRU 缓存；失败以工具错误返回，不悬挂。
