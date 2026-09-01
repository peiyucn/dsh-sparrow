# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First pre-release, published to the `next` channel for validation; features match the planned `0.1.0` first release
- Sidebar "Cloud Files" entry + panel (styled like the official Settings / Archive): list pages of 20, Load more cursor pagination, per-file delete (stronger notice for `dsh-` auto-uploaded files), one-click copy file_id
- Total count + drive-style quota bar: used / 25 GiB, adaptive-precision percentage, striped empty area, "Loaded X / N" synced with pagination
- Reuses the official DeepSeekFilesClient (connection facts from the llm-deepseek settings section + ctx.credentials); no local persistence

### 中文

- 首个预发布版本，先发 `next` 渠道验证；功能对齐计划中的 `0.1.0` 首版
- 侧边栏「云端文件」入口 + 面板（样式对齐官方设置 / 归档面板）：每页 20 条列表、Load more 游标翻页、单条删除（`dsh-` 自动上传文件给更强提示）、一键复制 file_id
- 总数 + 网盘式配额条：已用 / 25 GiB、自适应精度百分比、条纹空白区、「已加载 X / N」随翻页同步
- 复用官方 DeepSeekFilesClient（连接事实取自 llm-deepseek 设置节 + ctx.credentials）；无本地持久化
