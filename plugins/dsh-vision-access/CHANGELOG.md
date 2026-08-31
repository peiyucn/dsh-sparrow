# Changelog

## 0.1.0（2026-08-31 · 首发）

- `vision_read` 工具：对话贴图后主模型自动调用，host 直连官方视觉模型（默认 deepseek-v4-flash-vision-exp）读图，回传结构化文字报告（摘要 / OCR / 表格 / 版式）；直连 `ctx.llm` 而非子代理（实测 2.2s vs 46.3s）
- 按 agent 条件隐藏：主模型非 DeepSeek 系列、或本身原生看图时，该 agent 看不到 `vision_read`（像没有这个工具）
- 状态图标：模型选择器旁的眼睛三态（原生视觉灰显 / DeepSeek 文本点亮 / 其它无视觉带斜线），点击弹对应说明，切换模型实时跟随；新会话无模型信息时按共享默认模型判定（2026-08-31 修复图标消失）
- 报告进程内缓存（按「attachmentId + question」），同一张图重复询问秒回
- 凭据复用 dsh 配置的 DeepSeek API key，图片只发 DeepSeek 官方视觉模型、不出 DeepSeek 体系；零残留（不写文件、缓存仅进程内存）
- npm 首发
