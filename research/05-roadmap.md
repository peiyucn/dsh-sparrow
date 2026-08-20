# 05 · 实施路线图

模块顺序:先易后难、先 host 后 client。各模块 spec 见 docs/modules/。

## M0 · 骨架(已完成)

- [x] bundle 声明 + cordis.patch.yml + dev.patch.yml(--patch 加载 TS)。
- [x] host 半 hello(注册 sparrow 状态工具)。
- [x] typecheck + node:test 验证链(npm run verify)。

## M1 · 归档会话管理(侧边栏入口 + 恢复)

- [ ] host 半:参考 simbamo/dsh-session-unarchive 的纯 seam 方案(registry 补 unarchive,幂等)。
- [ ] 工具 session_archive(list / unarchive / unarchive-all)。
- [ ] client 半:sidebar.footer.action 挂「归档 (N)」面板。
- [ ] 改进点:HTTP API 回环检查、防御式补丁。

## M2 · FIM 输入补全(dock 建议条)

- [ ] 详见 research/02-fim-autocomplete.md 与 docs/modules/fim.md(待写)。

## M3 · 一键压缩(dock 压缩按钮)

- [ ] 详见 docs/modules/compact.md;client 单半,remote.commands.execute('/compact')。

## 风险清单

| 风险 | 等级 | 对策 |
|---|---|---|
| 官方加 unarchive / 归档面板 | 中 | M1 退役该模块(集合的退役协议) |
| FIM Beta 契约变动 | 中 | 转发层独立;盯官方 changelog |
| client bundle loud failure | 中 | 多模块同 bundle,测试压住;单模块损坏可禁用 |
| caret/Tab 键私有(输入框) | 中 | v1 点击采用;上游 PR 候选 |