# Changelog

## 0.1.0-alpha.1（2026-08-31 · 预发布）

- 包名由 `@dsh-sparrow/dsh-chat-suggest` 更名为 `@dsh-sparrow/dsh-chat-fim`（2026-09-01 改定，路由 / locale namespace / 存储键等内部标识同步对齐；旧名已 unpublish，无迁移成本）
- 开关文案中英统一为 **FIM**（原 zh「续写」/ en「Suggest」，2026-09-01 用户拍板：行业通用词 + 省按钮宽度）
- 首个预发布版本，先走 `next` 通道验证；功能同计划中的 `0.1.0` 首发


## 0.1.0（2026-08-31 · 正式发布）

- 迁移至 npm 组织作用域 `@dsh-sparrow`，以 0.1.0 作为首个正式发布版本
- 修复 `scripts/bundle-client.mjs` 的 `__ModuleLoader__.load` 注册 id 使用 scoped 包名，避免 dsh 客户端加载失败
- `npm run verify` 增加 client bundle 注册 id 与 package name 一致性校验
- 输入框续写联想：打字停顿触发，官方 @ 候选菜单同款悬浮卡展示；**Tab** 采用、**Esc** 丢弃（也可点选），与官方 @/斜杠触发菜单互斥让位
- 上游：DeepSeek **FIM 补全（Beta）**（`/beta/completions` + 说话人转写体）；续写模型**跟随主模型**（auto：v4-pro / v4-flash，vision 等回退 pro），卡片右下角展示实际模型与温度
- **触发灵敏度三档**（高/中/低）：停顿时长 250/400/800ms、最短草稿（中文 4/8/12 字、英文 2/6/8 字符）、夹入英文半词、词后空格、句末标点分别伸缩；胶囊右侧「方点 + ▾」为独立灵敏度触发区（与开关主体邻接，整区点击只开菜单不切换开关），tooltip 随档位变化，选择本地持久化
- 内容自适应：续写语言**跟随草稿**；建议**单句截断**（句末标点即止）；**Tab 链式续写**（高档可连续 Tab）
- 质量护栏：角色切换丢弃、退化复读、历史回声（用户前缀 / 助手窗口）、语言一致性；候选全被过滤时升温度 0.5 重试一次，仍无候选静默不显示
- 开关默认关闭、状态本地记忆；主模型非 DeepSeek 系列时整体隐藏；复用 dsh 配置的 DeepSeek API key（不进浏览器）
- **新会话页联想可用**：数据面挂 `conversation.input.dock`（dsh shell 在 hero 状态不渲染 composer.dock，input.dock 两种状态都挂载）
