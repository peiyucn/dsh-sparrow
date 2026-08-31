# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First pre-release, published to the `next` channel for validation; features match the planned `0.1.0` first release
- Sidebar "Cloud Files" entry + panel (styled like the official Settings / Archive): list pages of 20, Load more cursor pagination, per-file delete (stronger notice for `dsh-` auto-uploaded files), one-click copy file_id
- Total count + drive-style quota bar: used / 25 GiB, adaptive-precision percentage, striped empty area, "Loaded X / N" synced with pagination
- Reuses the official DeepSeekFilesClient (connection facts from the llm-deepseek settings section + ctx.credentials); no local persistence
