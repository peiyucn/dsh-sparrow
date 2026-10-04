# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.2.0-rc.2 (2026-09-30)

- Version-line alignment with official dsh 0.2.0-rc.2.
- The loading indicator now matches the one dsh uses in 0.2.0.
- The loading state now shows only the indicator; the "Loading…" text is gone.
- Opening the panel no longer briefly shows the previous list before loading.
- Fixed the cloud file list failing to load.
- Fixed file operations failing after upgrading dsh.
- The Cloud Files entry now sits at the top of the sidebar with Plugins and Automations, and opens as a page in the main area instead of a pop-up dialog.
- The cloud files page no longer dims the rest of the interface; use the sidebar or New Session to get back to a conversation.
- Fixed the text on the cloud files page being larger than elsewhere.
- Fixed the divider above the "dsh-sparrow" brand line sitting too close to the list above it.

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

