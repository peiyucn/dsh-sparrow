# 🐦 dsh-sparrow

![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow) ![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main) ![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**A collection of small DeepSeek Harness (DSH) Web plugins.**

Each plugin is published and installed independently; a plugin retires from the collection once DSH natively supports its feature. The version badge above tracks the collection's aligned release line (mirrored from official dsh); each plugin's own npm version is shown in the table.

## Install

Prerequisites: a working `dsh` CLI and `pnpm` (`dsh plugin` forwards installation to pnpm).

> The packages are published on npm, but do **not** install them with `npm install @dsh-sparrow/...` directly — that only downloads them into a `node_modules` without registering them in the DSH web profile. Use the `dsh plugin` command below so each package lands in `$DSH_HOME/profiles/web` and its bundle layer is activated. Restart DSH after installing.

## Plugins

| Plugin | What it does | npm | Install |
| :--- | :--- | :--- | :--- |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.md) | Chat input suggestions powered by DeepSeek FIM (Beta): pause to get an official-@-menu-style card, Tab adopts; three trigger-sensitivity levels; the completion model follows the main model. | ![npm](https://img.shields.io/npm/v/@dsh-sparrow/dsh-chat-fim) | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim` |
| [dsh-vision-bridge](plugins/dsh-vision-bridge/README.md) | A vision channel for text-only main models: the `vision_read` tool reads pasted images with the official DeepSeek vision model and returns a structured text report. | ![npm](https://img.shields.io/npm/v/@dsh-sparrow/dsh-vision-bridge) | `dsh plugin --profile web add @dsh-sparrow/dsh-vision-bridge` |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.md) | Manage archived sessions: unarchive, move to trash, delete permanently, restore from trash — a parent session and its subagents always move as one. | ![npm](https://img.shields.io/npm/v/@dsh-sparrow/dsh-archive-manage) | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage` |
| [dsh-nav-pin](plugins/dsh-nav-pin/README.md) | Turn navigation that stays on narrow conversations — pure stylesheet injection. | ![npm](https://img.shields.io/npm/v/@dsh-sparrow/dsh-nav-pin) | `dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin` |
| [dsh-file-manage](plugins/dsh-file-manage/README.md) | DeepSeek Files API cloud files: paginated listing, quota bar, per-file delete, one-click file_id copy. | ![npm](https://img.shields.io/npm/v/@dsh-sparrow/dsh-file-manage) | `dsh plugin --profile web add @dsh-sparrow/dsh-file-manage` |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.md) | Company CodeBuddy credits as a DSH LLM provider: credit rates in the model picker, header quota panel, per-turn credit pills. | ![npm](https://img.shields.io/npm/v/@dsh-sparrow/dsh-codebuddy-credits) | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |

## License

MIT
