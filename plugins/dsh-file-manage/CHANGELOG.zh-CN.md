# 更新日志

> English version: [CHANGELOG.md](CHANGELOG.md)。

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- 首个预发布版本，先发 `next` 渠道验证；功能对齐计划中的 `0.1.0` 首版
- 侧边栏「云端文件」入口 + 面板（样式对齐官方设置 / 归档面板）：每页 20 条列表、Load more 游标翻页、单条删除（`dsh-` 自动上传文件给更强提示）、一键复制 file_id
- 总数 + 网盘式配额条：已用 / 25 GiB、自适应精度百分比、条纹空白区、「已加载 X / N」随翻页同步
- 复用官方 DeepSeekFilesClient（连接事实取自 llm-deepseek 设置节 + ctx.credentials）；无本地持久化
