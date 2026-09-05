# dsh-chat-fim

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Chat input suggestions — a DeepSeek Harness (DSH) Web plugin (part of the dsh-sparrow collection).

After a short typing pause, a suggestion card styled like the official @ menu appears above the input — **Tab** adopts the text, **Esc** dismisses it. Powered by DeepSeek FIM completion (Beta); the continuation picks up in your own voice.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim
```

Requires dsh ≥ 0.1.2-rc.1 and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-chat-fim` directly — that only downloads the package into a `node_modules` and does not register it in the DSH web profile. Install with the `dsh plugin` command above, then restart DSH.

## Usage

* **Switch**: A "✦ FIM" pill in the input tool row toggles it; **off by default**, your choice is remembered locally
* **Trigger**: Suggestions fire after a typing pause; **a sentence-ending punctuation (`。！？.!?;；`) triggers only at High** (Medium/Low suppress it), and IME composition suppresses triggers; all other rules (pause length, min draft, embedded half-word, trailing space) scale with the sensitivity levels below
* **Suggestion**: Tab adopts, Esc dismisses (clicking works too); the card yields while the official @/slash menu is open; **each suggestion is one sentence** — keep pressing Tab to chain continuations (switch to High for more eager triggering)
* **Sensitivity**: the "dots + ▾" zone on the right side of the pill picks **High / Medium / Low** (clicking the whole zone opens the level menu without toggling the switch — 3 square dots always shown, 3/2/1 lit from the bottom, with a hover hint); the completion model **follows your selected main model** (v4-pro / v4-flash; falls back to pro for vision etc.). The rules:

  | Level | Pause | Min draft | Embedded half-word | Trailing space | Sentence end |
  |---|---|---|---|---|---|
  | High | 250ms | CJK 4 / Latin 2 chars | suggests | suggests | suggests |
  | Medium (default) | 400ms | CJK 8 / Latin 6 chars | no | suggests | no |
  | Low | 800ms | CJK 12 / Latin 8 chars | no | no | no |

* The whole switch is hidden when the current session's main model is not a DeepSeek model
* **Credentials**: Requests reuse the DeepSeek API key configured in dsh (FIM completion Beta) — no extra credentials, the key never reaches the browser; token usage bills to your DeepSeek account

## Screenshots

![Fill-in-the-middle (FIM) suggestion card](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-chat-fim.png)

## Uninstall & Residue

* The plugin writes no files and never touches the `.dsh` internals — it only forwards network requests.
* The only persistent state is the browser localStorage keys `dsh-chat-fim:enabled` (switch) and `dsh-chat-fim:sensitivity` (trigger sensitivity). They remain in the browser after uninstall and are harmless; delete them in DevTools if you mind.

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-chat-fim/CHANGELOG.md)
