# 🐦dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow?color=007ec6)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main&label=ci)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**Desk One (同桌) — one desk for you and harness.**

![Desk One hero](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-desk-one-hero.png)

`dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`

* **One panel, not five pages.** Notes, tasks, schedule and notebook review live behind a single sidebar entry.
* **Made for DSH.** The header's **Talk to Me** button turns a plain sentence into a prefilled prompt — notes, tasks and notebook pages can all be done by talking.
* **AI writes, you review.** Link a DSH workspace as the notebook library: the AI writes there, you annotate exact lines in a review session.

[Desk One docs](plugins/dsh-desk-one/README.md) · [Plugin market](https://dsh.pyai.site/)

Two ways to do anything here: click it yourself, or just tell DSH. The header's **Talk to Me** button drops a tab-aware prompt into the conversation, and the panel's "…" menu has **Make a wish** for feature requests.

Desk One is the desk. The other plugins below come with it and are installed separately.

## Plugins

| Plugin | What it does | Install |
| :--- | :--- | :--- |
| [dsh-desk-one](plugins/dsh-desk-one/README.md) | Desk One — notes, tasks, a read-only calendar and AI-written notebook review in one panel. | `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one` |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.md) | Fill-in-the-middle suggestions in the composer: pause, Tab to adopt, three sensitivity levels. | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim` |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.md) | CodeBuddy credits as an LLM provider: rates in the model picker, a quota panel, per-turn credits. | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |
| [dsh-theme-tone](plugins/dsh-theme-tone/README.md) | Tone skins over the built-in light and dark themes, plus conversation-layout tuning. | `dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone` |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.md) | Archived-session management: unarchive, trash, delete, restore; a parent and its subagents move together. | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage` |

## Requirements

- DSH 0.2.2-rc.3 — the exact official version line each release is built and verified against ([deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)); newer version lines, pre-releases in particular, are **not** covered. When a plugin meets an unsupported DSH it disables itself (with one log line) instead of breaking DSH.
- Node.js >= 22.19.0
- A working `dsh` CLI and `pnpm` (`dsh plugin` forwards installation to pnpm)

## Install

> The packages are published on npm, but do **not** install them with `npm install @dsh-sparrow/...` directly — that only downloads them into a `node_modules` without registering them in the DSH web profile. Use the `dsh plugin` command in the table above so each package lands in `$DSH_HOME/profiles/web` and its bundle layer is activated. Restart DSH after installing.

## Install from the DSH plugin market

You can also browse and install these from **Plugins → Discover** in DSH (custom plugin markets are experimental: turn on **Custom plugin markets** under **Plugins → Experimental plugins → More** first). Open <https://dsh.pyai.site/> for the index URL and steps; the index URL itself is:

```
https://dsh.pyai.site/market/index.json
```

Paste it into **Discover → Add index source**. The market marks which versions work with the DSH you are running — every plugin here only supports the exact version line its version number states, so the card usually shows the single installable version.

## Retired

No retired plugins remain in this repository: `dsh-nav-pin` and `dsh-vision-bridge` were deleted on 2026-10-27, and `dsh-file-manage` was deleted on 2026-10-31. The `@dsh-sparrow/dsh-file-manage` npm package keeps its published versions (not unpublished) but is no longer maintained; remove an existing install with `dsh plugin --profile web remove @dsh-sparrow/dsh-file-manage`.

## License

MIT
