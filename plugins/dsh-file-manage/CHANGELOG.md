# Changelog

## 0.1.0-alpha.1（2026-09-01 · 预发布）

- 包名由 `@dsh-sparrow/dsh-file-session` 更名为 `@dsh-sparrow/dsh-file-manage`（2026-09-01 改定，路由 / locale namespace / CSS 类等内部标识同步对齐；旧名从未发布，无迁移成本）
- 首个预发布版本，先走 `next` 通道验证；功能同计划中的 `0.1.0` 首发
- 侧边栏「云端文件」入口 + 面板（样式对齐官方 Settings / Archive）：清单每页 20 条、Load more 游标翻页、单条删除（`dsh-` 自动上传文件额外提示）、一键复制 file_id
- 总数统计 + 网盘式配额容量条：已用 / 25 GiB、自适应精度百分比、未使用区斜纹、列表翻页联动「已加载 X / 共 N」
- 复用官方 DeepSeekFilesClient（连接事实走 llm-deepseek 设置节 + ctx.credentials），无本地持久化
