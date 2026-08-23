# 02 · 路线图

仅记录未来计划。

## M1 · host half：FIM 转发路由

- [ ] Config schema + settings 分节
- [ ] POST /api/fim/complete：sessionId 校验、credentials 解析、错误映射、取消传播
- [ ] 验证：curl / console fetch 拿到补全文本

## M2 · client half：dock 建议条

- [ ] dsh.client 声明 + ./client 出口 + 组合行
- [ ] dock 条目 + 触发 / 防抖 / 取消逻辑
- [ ] 建议条 UI + 采用（setDraft）+ 作废
- [ ] i18n（zh / en）
- [ ] 真机手测清单逐项验收

## M3 · 发布

- [ ] README 用户文档 + CHANGELOG
- [ ] 版本号 + npm run verify
- [ ] npm publish 或 tarball 交付