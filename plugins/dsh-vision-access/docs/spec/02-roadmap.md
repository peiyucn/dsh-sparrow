# 02 · 路线图 — dsh-vision-access

> 里程碑可独立验收；每完成一项单独 commit。

## M0 · spec 评审

* [x] 00/01/02 评审通过后开工

## M1 · host half（核心链路）

* [x] 脚手架：package.json / tsconfig / cordis.patch.yml；tsconfig 类型路径指向当前 `@deepseek-ai/cordis` 实际位置
* [x] 门禁放行：包装 `resolveModelInfo`（抹除配置内文本路由的 inputModalities，可逆 + 版本记录）
* [x] `vision_read` 工具：attachmentId 反查 ref → `attachments.readImage` → `ctx.llm.prepareCall` 直连官方 vision 模型（弃用子代理，实测 46.3s → 2.2s）
* [x] 结构化报告 schema + render；attachmentId LRU 缓存
* [x] 降级与错误提示（含 reasoning 截断兜底 `resolveVisionOutput` + 8192/low 思考）；单测（反查/缓存键/报告解析/门禁判定/截断兜底）
* [x] 真实 web profile 装载验证（vision_read 在主会话可用；非 deepseek 主模型按 agent 屏蔽）

## M2 · 体验增强

* [ ] 视觉报告面板可见；多图合并为一次委托；失败一键重试
* [ ] 可选：llm/stream 自动投影（待 next(newOptions) 语义实测）
* [ ] 可选：第三方 VLM 降级配置（默认关闭，明示隐私）
* [ ] 可选：agentPresets 预设集成（视觉模型预置/校验）

## 发布

* 独立 npm 包 `dsh-vision-access`，按合集《发布》流程走 tag 或 `npm publish`；官方在纯文本路由上原生支持视觉读图后退役。
