# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First published version, released to the `next` channel for owner validation before the stable `0.1.0`
- `vision_read` tool: the main model calls it automatically after an image is pasted; the host reads the image directly with the official vision model (default deepseek-v4-flash-vision-exp) and returns a structured text report (summary / OCR / tables / layout); goes through `ctx.llm` instead of a subagent (measured 2.2s vs 46.3s)
- Hidden per agent conditionally: when the main model is not a DeepSeek model, or natively understands images, that agent cannot see `vision_read` (as if the tool did not exist)
- Status icon: a three-state eye beside the model selector (native vision greyed out / DeepSeek text lit / no-vision slashed); clicking shows the matching explanation, and it follows model switches live; with no model info on a new session it falls back to the shared default model
- In-process report cache (keyed by "attachmentId + question"); repeat questions about the same image answer instantly
- Reuses the DeepSeek API key configured in dsh; images are only sent to the official DeepSeek vision model and never leave the DeepSeek ecosystem; zero residue (no files written, cache is process memory only)

### 中文

- 首个发布版本，先发 `next` 渠道供 owner 验证，稳定版 `0.1.0` 待转正
- `vision_read` 工具：图片粘贴后主模型自动调用；host 直接用官方视觉模型（默认 deepseek-v4-flash-vision-exp）读图并回传结构化文字报告（摘要 / OCR / 表格 / 版式）；经 `ctx.llm` 直连而非子代理（实测 2.2s vs 46.3s）
- 按 agent 条件隐藏：主模型非 DeepSeek 系列、或原生就能看图时，该 agent 看不到 `vision_read`（如同该工具不存在）
- 状态图标：模型选择器旁三态眼睛（原生视觉灰显 / DeepSeek 文本点亮 / 无视觉带斜线）；点击显示对应说明，并实时跟随模型切换；新会话无模型信息时回退共享默认模型
- 进程内报告缓存（键为「attachmentId + question」）；同一图片的重复提问秒回
- 复用 dsh 里配置的 DeepSeek API key；图片只发给官方 DeepSeek 视觉模型、不离开 DeepSeek 生态；零残留（不写文件，缓存仅在进程内存）
