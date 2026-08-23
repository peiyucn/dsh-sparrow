# 02 · 路线图 — dsh-vision-subagent

> 里程碑可独立验收；每完成一项单独 commit。

## M0 · spec 评审（当前）

* [ ] 00/01/02 评审通过后开工

## M1 · host half（核心链路）

* [ ] 脚手架：package.json / tsconfig / cordis.patch.yml / dev.patch.yml；tsconfig 类型路径指向当前 `@deepseek-ai/cordis` 实际位置
* [ ] 门禁放行：包装 `resolveModelInfo`（抹除配置内文本路由的 inputModalities，可逆 + 版本记录）
* [ ] `vision_read` 工具：attachmentId 反查 ref → `attachments.readImage` → `subagents.start(agentOptions: 官方 vision 模型)`
* [ ] 结构化报告 schema + render；attachmentId 哈希缓存
* [ ] 降级与错误提示；单测（反查/缓存键/报告 schema/错误映射）
* [ ] dev.patch 本地验证（Pro 会话贴图 → 子代理读图 → 报告回传），`npm run verify` 全绿

## M2 · 体验增强

* [ ] 视觉报告面板可见；多图合并为一次委托；失败一键重试
* [ ] 可选：llm/stream 自动投影（待 next(newOptions) 语义实测）
* [ ] 可选：第三方 VLM 降级配置（默认关闭，明示隐私）
* [ ] 可选：agentPresets 预设集成（视觉子代理预置/校验）

## 发布

* 独立 npm 包 `dsh-vision-subagent`，按合集《发布》流程走 tag 或 `npm publish`；官方在纯文本路由上原生支持视觉子代理读图后退役。
