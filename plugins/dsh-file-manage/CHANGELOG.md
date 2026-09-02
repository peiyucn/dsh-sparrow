# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- README screenshots now use absolute URLs and are no longer packed into the npm package (functionally identical to the previous release).

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Full-page loading: the list renders only once entries and totals are both ready (removes the open flicker).

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First pre-release, published to the `next` channel for validation; features match the planned `0.1.0` first release
- Sidebar "Cloud Files" entry + panel (styled like the official Settings / Archive): list pages of 20, Load more cursor pagination, per-file delete (stronger notice for `dsh-` auto-uploaded files), one-click copy file_id
- Total count + drive-style quota bar: used / 25 GiB, adaptive-precision percentage, striped empty area, "Loaded X / N" synced with pagination
- Reuses the official DeepSeekFilesClient (connection facts from the llm-deepseek settings section + ctx.credentials); no local persistence

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Panel opens with a full-panel loading state: content is revealed only after both the file list and the total-count request settle, eliminating the loading flicker
