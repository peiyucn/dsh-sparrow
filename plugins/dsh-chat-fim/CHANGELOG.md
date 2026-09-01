# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First published version, released to the `next` channel for owner validation before the stable `0.1.0`
- Chat input suggestions: fired after a typing pause, shown in a floating card styled like the official @ candidate menu; **Tab** adopts, **Esc** dismisses (clicking works too); yields while the official @/slash trigger menu is open
- Upstream: DeepSeek **FIM completion (Beta)** (`/beta/completions` + speaker-transcribed prompt); the completion model **follows the main model** (auto: v4-pro / v4-flash, falls back to pro for vision etc.), the actual model and temperature are shown in the card corner
- Switch label **FIM** in both zh and en (decided 2026-09-01: industry-standard term + narrower button)
- **Three trigger sensitivity levels** (high / medium / low): pause 250/400/800ms, minimum draft (Chinese 4/8/12 chars, English 2/6/8 chars), embedded English half-word, trailing space, and sentence-end punctuation scale per level; the "dots + ▾" zone beside the pill is a separate sensitivity trigger area (clicking the whole zone opens the level menu without toggling the switch), the tooltip follows the level, and the choice persists locally
- Content-adaptive: the completion language **follows the draft**; suggestions are **truncated to one sentence** (stop at sentence-end punctuation); **Tab chaining** (High allows continuous Tab)
- Quality guards: role-switch discard, degenerate repetition, history echo (user prefix / assistant window), language consistency; when all candidates are filtered out, one retry at temperature 0.5, then silent empty if still none
- Switch off by default with local persistence; hidden entirely when the session's main model is not a DeepSeek model; reuses the DeepSeek API key configured in dsh (never enters the browser)
- **Works on the new-session page**: the data side mounts `conversation.input.dock` (the dsh shell does not render composer.dock in hero state; input.dock mounts in both states)

### 中文

- 首个发布版本，先发 `next` 渠道供 owner 验证，稳定版 `0.1.0` 待转正
- 输入框续写联想：停顿后触发，浮层卡片样式对齐官方 @ 候选菜单；**Tab** 采纳、**Esc** 关闭（点击亦可）；官方 @/斜杠菜单打开时让位
- 上游：DeepSeek **FIM 补全（Beta）**（`/beta/completions` + 说话人转写提示词）；补全模型**跟随主模型**（自动：v4-pro / v4-flash，vision 等场景回退 pro），卡片角落显示实际模型与温度
- 开关文案中英统一为 **FIM**（2026-09-01 拍板：行业通用词 + 按钮更窄）
- **触发灵敏度三档**（高 / 中 / 低）：停顿 250/400/800ms、最短草稿（中文 4/8/12 字，英文 2/6/8 字）、夹入英文半词、词后空格、句末标点逐档伸缩；开关旁「三点 + ▾」区域是独立灵敏度触发区（整区点击只开档位菜单、不切换开关），tooltip 跟随档位，选择本地持久化
- 内容自适应：续写语言**跟随草稿**；建议**截断到单句**（到句末标点为止）；**Tab 链式续写**（高档可持续 Tab）
- 质量护栏：角色切换丢弃、退化复读、历史回声（用户前缀 / 助手窗口）、语言一致性；候选全部被过滤时升温 0.5 重试一次，仍无则静默返回空
- 默认关闭并本地持久化；会话主模型非 DeepSeek 时整体隐藏；复用 dsh 里配置的 DeepSeek API key（绝不进浏览器）
- **新会话页可用**：数据面挂 `conversation.input.dock`（dsh shell 在 hero 状态不渲染 composer.dock；input.dock 两种状态都渲染）
