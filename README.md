# 🐦 dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

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
| [dsh-chat-fim](plugins/dsh-chat-fim/README.md) | ![Fill-in-the-middle (FIM) suggestion card](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-chat-fim.png)<br>Chat input suggestions powered by DeepSeek FIM (Beta): pause to get an official-@-menu-style card, Tab adopts; three trigger-sensitivity levels; the completion model follows the main model. | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim` |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.md) | ![Archive panel (archive & trash areas)](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-archive-manage.png)<br>Manage archived sessions: unarchive, move to trash, delete permanently, restore from trash — a parent session and its subagents always move as one. | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage` |
| [dsh-nav-pin](plugins/dsh-nav-pin/README.md) | ![Turn rail hover reveal](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-nav-pin.png)<br>Turn navigation that stays on narrow conversations — pure stylesheet injection. | `dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin` |
| [dsh-file-manage](plugins/dsh-file-manage/README.md) | ![Cloud Files panel](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-file-manage.png)<br>DeepSeek Files API cloud files: paginated listing, quota bar, per-file delete, one-click file_id copy. | `dsh plugin --profile web add @dsh-sparrow/dsh-file-manage` |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.md) | ![Credits entry and quota panel on the session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits.png)<br>Company CodeBuddy credits as a DSH LLM provider: model names with read-only facts (`x0.00 · 1M`) in the model picker, header quota panel, per-turn credit pills. | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |
| ~~**[dsh-vision-bridge](plugins/dsh-vision-bridge/README.md)**~~ — Retired | ![Vision status icon and its tooltip next to the model selector](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-vision-bridge.png)<br>A vision channel for text-only main models: the `vision_read` tool reads pasted images with the official DeepSeek vision model and returns a structured text report. DeepSeek main models are natively multimodal now — use `deepseek-flash` instead. | ✗ Retired — remove with `dsh plugin --profile web remove @dsh-sparrow/dsh-vision-bridge` |

## License

MIT
