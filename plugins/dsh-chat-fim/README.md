# dsh-chat-fim

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Chat input suggestions — a DeepSeek Harness (DSH) Web plugin (part of the dsh-sparrow collection).

After a short typing pause, a suggestion card styled like the official @ menu appears above the input — **Tab** adopts the text, **Esc** dismisses it. Powered by DeepSeek FIM completion (Beta); the continuation picks up in your own voice.

## Install

```bash
dsh plugin --profile web add dsh-chat-fim
```

Requires dsh ≥ 0.1.1-rc.2.

## Usage

* **Switch**: A "✦ Suggest" pill in the input tool row toggles it; **off by default**, your choice is remembered locally
* **Trigger**: Suggestions fire after ~0.4s of typing pause, with content-adaptive rules: no trigger when the draft is shorter than 8 characters (3 for pure Latin) or ends with sentence punctuation (`。！？.!?;；`); CJK drafts also skip when stopping mid-way through an embedded English word; **a trailing space always triggers** (next-word prediction for English, and for space-separated Chinese); IME composition suppresses triggers regardless
* **Suggestion**: Tab adopts, Esc dismisses (clicking works too); the card yields while the official @/slash menu is open
* **Model**: The ▾ next to the pill picks `auto` / `deepseek-v4-pro` / `deepseek-v4-flash` (default `auto` follows the main model); the card footer shows the token count, the model used, and the temperature
* The whole switch is hidden when the current session's main model is not a DeepSeek model
* **Credentials**: Requests reuse the DeepSeek API key configured in dsh (FIM completion Beta) — no extra credentials, the key never reaches the browser; token usage bills to your DeepSeek account

## Screenshots

![Suggestion card](docs/images/suggestion-menu.png)

![Model picker](docs/images/model-picker.png)

## Uninstall & Residue

* The plugin writes no files and never touches the `.dsh` internals — it only forwards network requests.
* The only persistent state is the browser localStorage keys `dsh-chat-fim:enabled` (switch) and `dsh-chat-fim:modelMode` (model choice). They remain in the browser after uninstall and are harmless; delete them in DevTools if you mind.
