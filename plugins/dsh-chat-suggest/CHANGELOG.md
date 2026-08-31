# Changelog

## 1.0.1-alpha.1（2026-08-31 · 修复客户端 bundle 注册 id）

- 修复 `scripts/bundle-client.mjs` 的 `__ModuleLoader__.load` 注册 id 未随 scoped 包名更新，导致 dsh 0.1.2 启动报 `loaded without registering "@dsh-sparrow/dsh-chat-suggest"` 的问题
- 根 `scripts/verify.mjs` 增加校验：client bundle 注册 id 必须等于 `package.json` 的 `name`

## 1.0.0（2026-08-31 · 正式首发）

- 迁移至 npm 组织作用域 `@dsh-sparrow` 正式发布 1.0.0（此前无作用域的 0.1.x 为试验发布线，已废弃并从 npm / GitHub 清理）
- 输入框续写联想：打字停顿触发，官方 @ 候选菜单同款悬浮卡展示；**Tab** 采用、**Esc** 丢弃（也可点选），与官方 @/斜杠触发菜单互斥让位
- 上游：DeepSeek **FIM 补全（Beta）**（`/beta/completions` + 说话人转写体）；续写模型**跟随主模型**（auto：v4-pro / v4-flash，vision 等回退 pro），卡片右下角展示实际模型与温度
- **触发灵敏度三档**（高/中/低）：停顿时长 250/400/800ms、最短草稿（中文 4/8/12 字、英文 2/6/8 字符）、夹入英文半词、词后空格、句末标点分别伸缩；胶囊内竖排三点指示 + tooltip 随档位变化，选择本地持久化
- 内容自适应：续写语言**跟随草稿**；建议**单句截断**（句末标点即止）；**Tab 链式续写**（高档可连续 Tab）
- 质量护栏：角色切换丢弃、退化复读、历史回声（用户前缀 / 助手窗口）、语言一致性；候选全被过滤时升温度 0.5 重试一次，仍无候选静默不显示
- 开关默认关闭、状态本地记忆；主模型非 DeepSeek 系列时整体隐藏；复用 dsh 配置的 DeepSeek API key（不进浏览器）
- **新会话页联想可用**：数据面挂 `conversation.input.dock`（dsh shell 在 hero 状态不渲染 composer.dock，input.dock 两种状态都挂载）
