# 01 · 详细设计

## 1. 需求与验收标准

### 需求

* 用户打字停顿约 400ms 后，若草稿非空且以非空白结尾，展示一条续写建议；
* 点击「采用」，建议文本追加进草稿；用户继续打字则建议自动作废；
* 无建议、低置信、请求失败时静默降级，不打断输入。

### 验收标准

1. 仅 plain 相出建议；claimed / adjudicating / submitting 相不出；
2. 采用后草稿 = 原草稿 + 建议文本，可正常发送；
3. 建议出街后草稿继续变化（draftRev 推进）即作废；
4. 无 key、限流、断网时不弹错误提示。

## 2. FIM API 契约

* 端点：POST https\://api.deepseek.com/beta/completions（OpenAI 兼容形状）
* 请求：model（默认 deepseek-v4-pro）、prompt（已输入草稿全文）、suffix（可选）、max\_tokens（默认 128，官方上限 4K）
* 响应：choices\[0].text

## 3. client half设计

* 挂载：注册 conversation.input.dock 条目（list 插槽、会话 scope）
* 数据源：owner 快照 input: InputState（draft / draftRev / phase）
* 触发：phase 为 plain；draft 以非空白结尾；编辑发生在末尾（新 draft 以旧 draft 为前缀）；防抖 400ms
* 请求：fetch POST /api/fim/complete，body { sessionId, prompt: draft }；AbortController 随 draftRev 变化或组件卸载取消
* 渲染：单行建议条（建议文本 + 采用按钮），文案走 locale
* 采用：inputActions.setDraft(draft + 建议文本)，前置校验 input.draft 仍等于建议基线
* 作废：draftRev 变化、phase 离开 plain、组件卸载

## 4. host half设计

### 配置（Config schema，同名 settings 分节）

| 设置项 | 默认值 | 说明 |
|---|---|---|
| baseURL   | <https://api.deepseek.com/beta> | FIM 端点      |
| model | deepseek-v4-pro | 补全模型 |
| maxTokens | 128 | 单条建议输出上限 |
| apiKeyEnv | DEEPSEEK\_API\_KEY              | 凭据引用（环境变量名） |

### 路由

POST /api/fim/complete（经 ctx.webServer.register，kind: prefix，path: /api/fim）

1. 校验 sessionId 为真实会话；
2. 经 credentials seam 解析 API key；
3. 转发 FIM 请求（透传请求取消信号）；
4. 错误映射：401 → AUTH、429 → RATE\_LIMIT、网络失败 → TRANSPORT、超时 → TIMEOUT；
5. 响应 { text }。

## 5. 时序

```
打字 → 防抖 400ms → fetch /api/fim/complete → FIM Beta → 建议条渲染 → 点击采用 → setDraft
```

## 6. 边界与取舍

| 项 | 决定 | 理由 |
|---|---|---|
| 光标位置不可见 | 仅末尾输入时出建议 | InputState 不含 caret |
| Tab 键不可用 | 点击采用 | 键盘仲裁是输入框私有面 |
| 单条建议 | 不做候选列表 | 克制噪声 |
| 采用后文本进入会话 | 作为普通草稿文本发送 | 符合用户预期 |

## 7. 测试要点

* 触发条件与作废判定抽成纯函数，node:test 覆盖；
* host 路由错误映射与取消传播用 mock fetch 覆盖；
* 结构测试：bundle 声明与组合行（test/structure.test.mjs）。

