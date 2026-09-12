# 🐦dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow?color=007ec6)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main&label=ci)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**A collection of small DeepSeek Harness (DSH) Web plugins.**

Each plugin is published and installed independently; a plugin retires from the collection once DSH natively supports its feature. The version badge above tracks the collection's aligned release line (mirrored from official dsh) and links to the npm org page, where each package's own version is listed.

## Requirements

- DSH 0.1.5-rc.2 — the exact official version line each release is built and verified against ([deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)); newer version lines, pre-releases in particular, are **not** covered. When a plugin meets an unsupported DSH it disables itself (with one log line) instead of breaking DSH.
- Node.js >= 22.19.0
- A working `dsh` CLI and `pnpm` (`dsh plugin` forwards installation to pnpm)

## Install

> The packages are published on npm, but do **not** install them with `npm install @dsh-sparrow/...` directly — that only downloads them into a `node_modules` without registering them in the DSH web profile. Use the `dsh plugin` command below so each package lands in `$DSH_HOME/profiles/web` and its bundle layer is activated. Restart DSH after installing.

## Plugins

| Plugin | What it does | Install |
| :--- | :--- | :--- |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-chat-fim&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-chat-fim)                                     | ![Fill-in-the-middle (FIM) suggestion card](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-chat-fim.png "ratio:0.18")<br>Chat input suggestions powered by DeepSeek FIM (Beta): pause to get an official-@-menu-style card, Tab adopts; three trigger-sensitivity levels; the completion model follows the main model. | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim`          |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-archive-manage&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-archive-manage)             | ![Archive panel (archive & trash areas)](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-archive-manage.png "ratio:0.15")<br>Manage archived sessions: unarchive, move to trash, delete permanently, restore from trash — a parent session and its subagents always move as one.                                         | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage`    |
| [dsh-nav-pin](plugins/dsh-nav-pin/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-nav-pin&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-nav-pin)                                         | ![Turn rail hover reveal](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-nav-pin.png "ratio:0.13")<br>Turn navigation that stays on narrow conversations — pure stylesheet injection.                                                                                                                                   | `dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin`           |
| [dsh-file-manage](plugins/dsh-file-manage/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-file-manage&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-file-manage)                         | ![Cloud Files panel](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-file-manage.png "ratio:0.15")<br>DeepSeek Files API cloud files: paginated listing, quota bar, per-file delete, one-click file_id copy.                                                                                                             | `dsh plugin --profile web add @dsh-sparrow/dsh-file-manage`       |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-codebuddy-credits&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-codebuddy-credits) | ![Credits entry and quota panel on the session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits.png "ratio:0.25")<br>Company CodeBuddy credits as a DSH LLM provider: model names with read-only facts (`x0.00 · 1M`) in the model picker, header quota panel, per-turn credit pills.             | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |

## Retired

- **[~~dsh-vision-bridge~~](plugins/dsh-vision-bridge/README.md)** — a vision channel for text-only main models: the `vision_read` tool reads pasted images with the official DeepSeek vision model and returns a structured text report. DeepSeek main models are natively multimodal now — use `deepseek-flash` instead. Uninstall with `dsh plugin --profile web remove @dsh-sparrow/dsh-vision-bridge`.

## License

MIT
