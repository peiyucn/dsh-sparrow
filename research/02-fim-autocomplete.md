# 02 · FIM 输入联想：API 契约与插件设计

## 1. 需求定义（用户确认版）

用户在聊天输入框打字时，AI 给出「接下来可能写的文字」建议；用户可一键采用（追加进草稿）。**不做**「规定模型回答开头」（那是 chat_prefix_completion 的用途，已否决）。

## 2. DeepSeek FIM Beta API 契约

> 来源：https://api-docs.deepseek.com/zh-cn/guides/fim_completion/ （剥离稿 raw/fim_completion_zh.txt）

- base_url 必须是 https://api.deepseek.com/beta（Beta 功能开关）。
- completions.create(model, prompt, suffix?, max_tokens)：prompt=已输入文本，suffix=可选后缀，模型补全后续内容。
- **最大补全长度 4K**（对输入联想绰绰有余）。
- 官方定位就是「内容续写、代码补全」——Continue 插件用它做 VSCode 自动补全。**这就是我们要的能力**。

## 3. DSH 输入侧公开面（rc.8 实测证实）

| 能力 | 通道 | 说明 |
|---|---|---|
| 读草稿 | conversation.input.* 插槽 owner 快照 input: InputState | 含 draft、draftRev、phase（plain/adjudicating/claimed/submitting）、occurrences、queue；骨架在 store 变化时重渲染，组件无需自订阅 |
| 读草稿（备选） | provide 通道 useInput hook | sessions.provide 的标准会话套件，InputBar 本人即经它消费 |
| 写草稿 | inputActions.setDraft(text) | **唯一公开写路径**：整稿替换，机器自动做 occurrence 平移/diff |
| 发送 | inputActions.submit() | 公开动作面成员 |
| 改写 span | scoped bail 事件 slash/input-insert-text | 菜单/引用专用（带 draftRev CAS），联想场景不需要 |

**私有面（不可用，v1 明确回避）**：
- ComposerKeyboard（track/arbitrate/undo/redo/paste）——InputBar 包内私递；
- **ghost text 渲染**（claim hint 的灰色幽灵字）——InputBar 内部；
- **caret 位置**——InputState 不含光标，跨插件拿不到；
- **Tab 键拦截**——键盘仲裁仅菜单打开时对方向键/Enter/Escape 生效，无 Tab。

## 4. 设计（v1）

### client 半：dock 建议条

- 注册 conversation.input.dock（list 插槽，会话 scope）条目，id 如 fim-suggestion。
- 组件读 input 快照：
  - **触发**：phase === 'plain' 且 draft 非空、以非空白结尾；距上次变化防抖约 400ms；且最后一次编辑发生在末尾（启发式：新 draft 以旧 draft 为前缀）。
  - **请求**：fetch /api/fim/complete（携带 sessionId + prompt=draft），AbortController 随 draftRev 变化/卸载取消。
  - **渲染**：单行建议条（联想文本 + 采用按钮），不打断输入；低置信/空结果不显示。
  - **采用**：比对当前 input.draft 仍等于建议基线（draft 已被继续编辑则放弃）→ inputActions.setDraft(draft + 建议文本) → 清建议。
  - **放弃**：draftRev 变化、phase 离开 plain、组件卸载。
- 说明：点击采用而非 Tab——Tab 键是私有面；候选单条而非多条——克制噪声。

### host 半：FIM 转发路由

- ctx.webServer.register 挂 POST /api/fim/complete。
- 处理：校验 sessionId 为真实会话 → 读配置（settings 分节：baseURL 默认 beta、model、maxTokens 默认 64~128）→ credentials seam 取 API key → 调 FIM → 返回 { text }。
- 取消/超时/错误码：401/429/网络错误映射为稳定 JSON 错误，client 静默降级（不出错条）。

### 通道选型（rc.8 复核）

| 通道 | 结论 |
|---|---|
| **ctx.webServer 自有路由** | ✅ 采用：第三方完全可用、无构建流水线 |
| typert Remote（ctx.remote.*） | ❌ rc.8 的 fileReferences/list 是上游 typert-generator 生成产物 + dsh-api-remotes 构建期挂载；第三方复制不了这条链 |
| 动态插件 harness.handle / host.call | ❌ 仅限动态插件 |
| 官方网关 connection.api.* | ❌ 构建期固定面 |

## 5. 边界、风险与后续

| 项 | 说明 |
|---|---|
| caret 不可见 | 只在「末尾输入」启发式下出建议；光标在中间时不出 |
| Tab 键 | v1 点击采用；v2 可探索上游支持或文档级监听（产品规范不建议全局 DOM 监听） |
| FIM 4K 上限 | 足够；max_tokens 控制在 128 内 |
| Beta 端点变更 | 转发层独立，只改 host 半一处 |
| 噪声克制 | 单条建议 + 低置信不显示 + 建议被继续打字立即作废 |
| inline ghost text | 需上游给公开面；记录为上游 PR 候选 |

## 6. 已否决方案存档

- **回复前缀续写（chat_prefix_completion）**：用户确认为不同功能；若将来要做，按原调研方案 A（host 工具 + 自定义 adapter 路由）另起 dsh-prefix-completion 包，与本插件无关。
