# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.2.0-rc.2 (2026-10-08)

- Now adapted to official dsh 0.2.0-rc.2 (web and desktop).
- The Cloud Files entry moved to the top of the sidebar, beside Plugins and Automations, and now opens as a page in the main area instead of a dialog.

## 0.1.5-rc.2.1 (2026-09-11)

- "Load more" now loads 20 more files per click instead of 100.

## 0.1.5-rc.2 (2026-09-10)

- Version-line alignment with official dsh 0.1.5-rc.2.
- The loading indicator now matches the rest of the dsh interface.
- Escape now closes the delete confirmation first, so it no longer stays on screen after the panel closes.

## 0.1.2-rc.1.1 (2026-09-09)

- On a dsh version this plugin does not support, it turns itself off and leaves dsh working.

## 0.1.2-rc.1 (2026-09-05)

- Version-line alignment with official dsh 0.1.2-rc.1 (stability line).
- Fixed the file list going wrong after quickly reopening the panel or tapping Retry.
- Requests stop once the panel is closed, so a cancelled file count no longer keeps using your API credit.
- The sidebar "Cloud Files" button now matches the width of Settings.
- "Load more" now sits at the end of the file list, and the list scrolls to the bottom after each page loads.
- A small 🐦 dsh-sparrow brand line closes the panel.

## 0.1.0 (2026-09-02)

- First stable release.

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- No user-perceivable change from the previous release.

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- The list now appears only once files and totals are both loaded, so opening no longer flickers.

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First release.
- Sidebar "Cloud Files" entry with a page that lists your cloud files 20 at a time, and lets you load more, delete a file, and copy its file ID.
- Shows how much of your 25 GiB storage is used and how many files are loaded so far.
- Reuses the DeepSeek connection already configured in dsh; nothing is stored locally.

