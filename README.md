# 🐦 dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**A collection of small DeepSeek Harness (DSH) Web plugins.**

Each plugin is published and installed independently; a plugin retires from the collection once DSH natively supports its feature. The version badge above tracks the collection's aligned release line (mirrored from official dsh) and links to the npm org page, where each package's own version is listed.

## Install

Prerequisites: a working `dsh` CLI and `pnpm` (`dsh plugin` forwards installation to pnpm).

> The packages are published on npm, but do **not** install them with `npm install @dsh-sparrow/...` directly — that only downloads them into a `node_modules` without registering them in the DSH web profile. Use the `dsh plugin` command below so each package lands in `$DSH_HOME/profiles/web` and its bundle layer is activated. Restart DSH after installing.

## Plugins

| Plugin | What it does | Install |
| :--- | :--- | :--- |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.md) | Chat input suggestions powered by DeepSeek FIM (Beta): pause to get an official-@-menu-style card, Tab adopts; three trigger-sensitivity levels; the completion model follows the main model. | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim` |
| [dsh-vision-bridge](plugins/dsh-vision-bridge/README.md) | A vision channel for text-only main models: the `vision_read` tool reads pasted images with the official DeepSeek vision model and returns a structured text report. | `dsh plugin --profile web add @dsh-sparrow/dsh-vision-bridge` |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.md) | Manage archived sessions: unarchive, move to trash, delete permanently, restore from trash — a parent session and its subagents always move as one. | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage` |
| [dsh-nav-pin](plugins/dsh-nav-pin/README.md) | Turn navigation that stays on narrow conversations — pure stylesheet injection. | `dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin` |
| [dsh-file-manage](plugins/dsh-file-manage/README.md) | DeepSeek Files API cloud files: paginated listing, quota bar, per-file delete, one-click file_id copy. | `dsh plugin --profile web add @dsh-sparrow/dsh-file-manage` |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.md) | Company CodeBuddy credits as a DSH LLM provider: credit rates in the model picker, header quota panel, per-turn credit pills. | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |

## License

MIT
