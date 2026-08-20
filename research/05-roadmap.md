# 05 · 实施路线图

## M0 · 环境（0.5 天）

- [ ] 确认基线：DSH rc.8。
- [ ] 建开发 profile 或用 web profile + --patch overlay；--dump-config 验证层序。
- [ ] 确认 client bundle 构建与 pnpm run dev:web 热更可用（client 半开发依赖）。

## M1 · host 半：FIM 转发路由（1 天）

- [ ] 插件骨架：name/inject/apply + Config（schemastery：baseURL 默认 https://api.deepseek.com/beta、model、maxTokens 默认 128、apiKeyEnv）。
- [ ] ctx.webServer.register 挂 POST /api/fim/complete：sessionId 校验 → credentials seam 取 key → 调 FIM → { text }。
- [ ] 错误映射（401/429/网络/超时）与取消传播。
- [ ] 验证：curl 或浏览器 console fetch 直接调用，拿到补全文本。

## M2 · client 半：dock 建议条（2 天）

- [ ] dsh.client 声明 + ./client 出口；行 ui-fim 进组合；验证 window.__DSH_BOOT__ 含新 entry。
- [ ] 注册 conversation.input.dock 条目；以 owner 快照 input 为数据源。
- [ ] 触发逻辑：plain 相 + 非空白结尾 + 末尾输入启发式 + 400ms 防抖 + AbortController。
- [ ] 渲染单行建议条（locale 文案）；采用 = 基线比对 + inputActions.setDraft(draft + text)；draftRev 变化即放弃。
- [ ] 验证：打字出建议 → 点击采用追加 → 继续打字建议作废 → 提交/claim 相不出。

## M3 · 打磨与发布（1–2 天）

- [ ] 限流/失败静默降级；设置页可见（settings 分节）。
- [ ] i18n（zh/en）；README（含官方便签要求的 Model Experience / Limitations 两节）。
- [ ] 发布：npm 或 tarball；用户侧 dsh plugin add 说明 + disabled 粒度说明。

## 风险清单

| 风险 | 等级 | 对策 |
|---|---|---|
| caret 不可见 / Tab 键私有 | 中 | v1 末尾输入启发式 + 点击采用；上游 PR 候选记录在案 |
| FIM Beta 契约变动 | 中 | 转发层独立；盯官方 changelog |
| client bundle loud failure | 中 | 单包自担；M0 先跑通构建流 |
| rc.8 升级变动（slot/provide 契约） | 中 | M2 实现前以 cordis_inspect 查实测契约 |
| 建议噪声 | 低 | 单条 + 低置信不显示 + 编辑即作废 |
