# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.2-rc.1 (2026-09-05)

- Version-line alignment with official dsh 0.1.2-rc.1 (stability line).
- Pagination and delete race fixes: after quickly reopening the panel or hitting Retry, stale pages no longer merge into the fresh list, "Load more" no longer sticks disabled, and a late delete callback no longer dismisses a newly opened confirmation dialog.
- Requests that outlive the panel now stop by themselves (15s cap) instead of hanging, and the count pass stops as soon as the panel disconnects, so a closed panel no longer keeps burning API quota.
- The sidebar "Cloud Files" button now aligns its width with Settings (same as the Archive entry).
- "Load more" now lives at the end of the file list and the list auto-scrolls to the bottom after each page loads (the button no longer sits in a fixed panel footer).
- A subtle 🐦 dsh-sparrow brand line closes the panel.

## 0.1.0 (2026-09-02)

- Promoted 0.1.0 (identical to 0.1.0-alpha.3).

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- README screenshots now use absolute URLs and are no longer packed into the npm package (functionally identical to the previous release).

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Full-page loading: the list renders only once entries and totals are both ready (removes the open flicker).

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First pre-release, published to the `next` channel for validation; features match the planned `0.1.0` first release
- Sidebar "Cloud Files" entry + panel (styled like the official Settings / Archive): list pages of 20, Load more cursor pagination, per-file delete (stronger notice for `dsh-` auto-uploaded files), one-click copy file_id
- Total count + drive-style quota bar: used / 25 GiB, adaptive-precision percentage, striped empty area, "Loaded X / N" synced with pagination
- Reuses the official DeepSeekFilesClient (connection facts from the llm-deepseek settings section + ctx.credentials); no local persistence

