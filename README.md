# 🐦dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow?color=007ec6)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main&label=ci)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**A collection of small DeepSeek Harness (DSH) Web plugins.**

Each plugin is published and installed independently; a plugin retires from the collection once DSH natively supports its feature or it is no longer worth maintaining. The version badge above tracks the collection's aligned release line (mirrored from official dsh) and links to the npm org page, where each package's own version is listed.

## Requirements

- DSH 0.2.1-rc.5 — the exact official version line each release is built and verified against ([deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)); newer version lines, pre-releases in particular, are **not** covered. When a plugin meets an unsupported DSH it disables itself (with one log line) instead of breaking DSH.
- Node.js >= 22.19.0
- A working `dsh` CLI and `pnpm` (`dsh plugin` forwards installation to pnpm)

## Install

> The packages are published on npm, but do **not** install them with `npm install @dsh-sparrow/...` directly — that only downloads them into a `node_modules` without registering them in the DSH web profile. Use the `dsh plugin` command below so each package lands in `$DSH_HOME/profiles/web` and its bundle layer is activated. Restart DSH after installing.

## Install from the DSH plugin market

You can also browse and install these from **Plugins → Discover** in DSH (custom plugin markets are experimental: turn on **Custom plugin markets** under **Plugins → Experimental plugins → More** first). Open <https://dsh.pyai.site/> for the index URL and steps; the index URL itself is:

```
https://dsh.pyai.site/market/index.json
```

Paste it into **Discover → Add index source**. The market marks which versions work with the DSH you are running — every plugin here only supports the exact version line its version number states, so the card usually shows the single installable version.

## Plugins

| Plugin | What it does | Install |
| :--- | :--- | :--- |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-chat-fim&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-chat-fim)                                     | ![Fill-in-the-middle (FIM) suggestion card](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-chat-fim.png "ratio:0.18")<br>Chat input suggestions powered by DeepSeek FIM (Beta): pause to get a suggestion card, Tab adopts; three trigger-sensitivity levels; the completion model follows the main model. | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim`          |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-archive-manage&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-archive-manage)             | ![Archive panel (archive & trash areas)](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-archive-manage.png "ratio:0.15")<br>Manage archived sessions: unarchive, move to trash, delete permanently, restore from trash — a parent session and its subagents always move as one.                                         | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage`    |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-codebuddy-credits&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-codebuddy-credits) | ![Credits entry and quota panel on the session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits.png "ratio:0.25")<br>Company CodeBuddy credits as a DSH LLM provider: each model's credit rate in the model picker, a quota panel in the header, and per-turn credits.             | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |
| [dsh-theme-tone](plugins/dsh-theme-tone/README.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-theme-tone&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-theme-tone)                                     | ![Dark theme](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png "ratio:0.5") ![Light theme](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png "ratio:0.5")<br>Tone skins for DSH's built-in light and dark themes (dark on the left, light on the right), plus conversation-area layout tuning once a tone is picked. | `dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone`        |

## Retired

No retired plugins remain in this repository: `dsh-nav-pin` and `dsh-vision-bridge` were deleted on 2026-10-27, and `dsh-file-manage` was deleted on 2026-10-31. The `@dsh-sparrow/dsh-file-manage` npm package keeps its published versions (not unpublished) but is no longer maintained; remove an existing install with `dsh plugin --profile web remove @dsh-sparrow/dsh-file-manage`.

## License

MIT
