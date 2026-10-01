# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.2.0-rc.2 (2026-09-30)

- Version-line alignment with official dsh 0.2.0-rc.2.
- The panel loading indicator now matches the official dsh loader (the old dot-matrix animation is gone).
- The panel's loading state is just the spinner now — the "Loading…" label beside it is gone, matching how dsh itself shows `StateDot`.
- Opening the panel no longer flashes the previous full-height list before the spinner appears.
- Fixed the cloud file list failing to load on the new line (endpoint generation change, `order` parameter removed, renamed icons).
- Fixed operations failing after a version-line upgrade because the files client constructor signature changed.
- The Cloud Files entry moved to the **top of the sidebar**, beside the official Plugins and Automations entries, and now opens as a **page in the main area** instead of a pop-up dialog.
- The cloud files page no longer dims or blocks the rest of the interface: it is a normal page, and the way back to a conversation is the official one (pick a session in the sidebar, or New Session).
- Fixed the cloud files page's text rendering larger than elsewhere: rows without a size of their own no longer fall back to the browser default, and text size and line height now match the official lists.
- Fixed the divider above the "dsh-sparrow" brand line at the bottom of the cloud files page touching the list above it.

## 0.1.5-rc.2.1 (2026-09-11)

- "Load more" now reveals 20 more files per click (previously 100).

## 0.1.5-rc.2 (2026-09-10)

- Version-line alignment with official dsh 0.1.5-rc.2.
- The panel's loading indicator now uses dsh's own dot-matrix chase animation, matching the rest of the UI.
- Escape now closes the delete confirmation first instead of leaving it stranded on screen after the panel closes.

## 0.1.2-rc.1.1 (2026-09-09)

- If dsh is upgraded to a version this plugin does not support yet, the plugin now disables itself instead of running against an unknown contract (dsh and other plugins are unaffected).

## 0.1.2-rc.1 (2026-09-05)

- Version-line alignment with official dsh 0.1.2-rc.1 (stability line).
- Pagination and delete race fixes: after quickly reopening the panel or hitting Retry, stale pages no longer merge into the fresh list, "Load more" no longer sticks disabled, and a late delete callback no longer dismisses a newly opened confirmation dialog.
- Requests that outlive the panel now stop by themselves instead of hanging (15s cap for list/delete, 60s for the count pass), and the count pass stops paging as soon as the client connection drops, so an abandoned count no longer keeps burning API quota.
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

