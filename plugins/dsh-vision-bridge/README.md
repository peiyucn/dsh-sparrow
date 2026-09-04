# dsh-vision-bridge

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

The official DeepSeek vision channel for text-only main models — official vision model only, no third-party models or credentials. A DeepSeek Harness (DSH) Web plugin (part of the dsh-sparrow collection).

When the main model cannot see images, it automatically calls the provided `vision_read` tool: the host reads the image with the official vision model and returns a structured text report (summary / OCR / tables / layout) — the main model stays the brain of the conversation.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-vision-bridge
```

Requires dsh ≥ 0.1.2-rc.1 and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-vision-bridge` directly — that only downloads the package into a `node_modules` and does not register it in the DSH web profile. Install with the `dsh plugin` command above, then restart DSH.

## Usage

* **Zero config**: Paste an image and just ask the main model to "look at it" — it calls `vision_read` on its own
* **Status icon**: The eye glyph next to the model selector has **three states** following the current model's capability — native-vision models (grey) click to show "native vision"; DeepSeek text models (lit blue-purple) click to show "cross-model reading" (naming the vision model); other non-vision models (grey with a slash) click to show "no vision capability". Color and text follow the model instantly as you switch.
* The tool hides itself when the main model sees images natively (e.g. deepseek-v4-flash-vision-exp) or is not a DeepSeek model — the image already reaches the model directly, so a text transcription would only degrade it
* **Credentials**: Vision calls reuse the DeepSeek API key configured in dsh; images only go to DeepSeek's official vision model and never leave the DeepSeek ecosystem — no extra credentials
* Reports are cached in-process per image + question, so repeated asks answer instantly

## Screenshots

![Status icon next to the model selector](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-vision-bridge.png)

## Uninstall & Residue

* **Zero residue**: Writes no files and never touches the `.dsh` internals; the report cache lives only in process memory and vanishes on exit.

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-vision-bridge/CHANGELOG.md)
