# 🐦 dsh-sparrow

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**A collection of small DeepSeek Harness (DSH) Web plugins.**

Each plugin is published and installed independently; a plugin retires from the collection once DSH natively supports its feature.

## Install

Prerequisites: a working `dsh` CLI and `pnpm` (`dsh plugin` forwards installation to pnpm).

> The packages are published on npm, but do **not** install them with `npm install @dsh-sparrow/...` directly — that only downloads them into a `node_modules` without registering them in the DSH web profile. Use the `dsh plugin` command below so each package lands in `$DSH_HOME/profiles/web` and its bundle layer is activated. Restart DSH after installing.

## dsh-chat-fim

Chat input suggestions. After a short typing pause, an official-@-menu-style card suggests what you may type next — Tab adopts, Esc dismisses; powered by DeepSeek FIM completion (Beta), with three trigger-sensitivity levels (high / medium / low); the completion model follows your selected main model.

> DeepSeek main models only (hidden otherwise); reuses the DeepSeek API key configured in dsh — no extra credentials.

![Suggestion card](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-chat-fim.png)

Docs: [dsh-chat-fim README](plugins/dsh-chat-fim/README.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim
```

## dsh-vision-bridge

The official DeepSeek vision channel for text-only main models — official vision model only, no third-party models or credentials. The main model calls the `vision_read` tool, the host reads the image with the official vision model and returns a structured text report — the main model stays the brain; the tool hides itself when the main model already sees images.

> DeepSeek main models only (hidden otherwise); reuses the DeepSeek API key configured in dsh — images never leave the DeepSeek ecosystem.

![Status icon next to the model selector](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-vision-bridge.png)

Docs: [dsh-vision-bridge README](plugins/dsh-vision-bridge/README.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-vision-bridge
```

## dsh-archive-manage

Archived-session management. The "Archive" entry in the sidebar lets you unarchive sessions (back to the session list), move them to trash (the session folder is moved out, reversible), or delete them permanently; the trash restores or deletes entries individually or in bulk.

![Archive panel](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-archive-manage.png)

Docs: [dsh-archive-manage README](plugins/dsh-archive-manage/README.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage
```

## dsh-nav-pin

Turn navigation that stays on narrow conversations. The official turn rail hides below a 900px conversation column; this plugin moves the breakpoint to 700px, fades the rail in as a floating overlay on hover below it (no frame, no background — same look as the wide layout), and caps the conversation content width to 120px clearance per side (640px official minimum floor) so the right drag handle no longer crowds the rail.

> Pure stylesheet injection: no toggle, no button, no settings, no persisted state; uninstalling restores the official behavior.

![Turn rail hover reveal](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-nav-pin.png)

Docs: [dsh-nav-pin README](plugins/dsh-nav-pin/README.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin
```

## dsh-file-manage

DeepSeek Files API cloud file management. The "Cloud Files" entry in the sidebar lists every cloud file under your API key: cursor pagination, size / upload / expiry times, per-file deletion and one-click file_id copy. Reuses the official DeepSeekFilesClient — no extra credentials.

> The official API has no batch-delete endpoint (no "delete all") and no download endpoint (no preview); the 10000-file / 25 GiB quota is an official limit.

![Cloud Files panel](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-file-manage.png)

Docs: [dsh-file-manage README](plugins/dsh-file-manage/README.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-file-manage
```

## dsh-codebuddy-credits

Company CodeBuddy credits as a DSH LLM provider — your enterprise-issued
WorkBuddy/CodeBuddy quota, spent inside DSH. Official API key only (no token
reverse engineering, no CodeBuddy agent harness): save the key on the
**CodeBuddy Credits** row under Settings → Models, then pick CodeBuddy models
in the composer, each showing its credit rate (`x0.79`, `free`). A sidebar
entry opens the quota panel (account, used / limit / remaining, reset date,
selected model info); the composer stats line accumulates the session's
credits, and each turn carries a credit pill with the per-call breakdown.

> Streaming endpoint only; keys and usage records stay on your CodeBuddy
> account — see the plugin README for the honest limitations.

Docs: [dsh-codebuddy-credits README](plugins/dsh-codebuddy-credits/README.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits
```

## License

MIT
