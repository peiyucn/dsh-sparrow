# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.2-rc.1 (2026-09-04)

- Version-line alignment with official dsh 0.1.2-rc.1 (stability line).
- The vision status icon now shares the model seat's directory: it appears as soon as the page loads and no longer waits for the session history to load.
- Native-vision main models have zero presence: the icon and its popover stay hidden entirely instead of showing a grayed-out state.
- The icon state now matches actual availability: DeepSeek text models that are not configured for the vision bridge show "no vision" instead of promising a read that would be rejected, and the state re-checks itself after the model directory or credentials change.

## 0.1.0 (2026-09-02)

- Promoted 0.1.0 (identical to 0.1.0-alpha.3).

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- README screenshots now use absolute URLs and are no longer packed into the npm package (functionally identical to the previous release).

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Version-line alignment 0.1.0-alpha.2 (functionally identical to the previous release).

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First published version, released to the `next` channel for owner validation before the stable `0.1.0`
- `vision_read` tool: the main model calls it automatically after an image is pasted; the host reads the image directly with the official vision model (default deepseek-v4-flash-vision-exp) and returns a structured text report (summary / OCR / tables / layout); goes through `ctx.llm` instead of a subagent (measured 2.2s vs 46.3s)
- Hidden per agent conditionally: when the main model is not a DeepSeek model, or natively understands images, that agent cannot see `vision_read` (as if the tool did not exist)
- Status icon: a three-state eye beside the model selector (native vision greyed out / DeepSeek text lit / no-vision slashed); clicking shows the matching explanation, and it follows model switches live; with no model info on a new session it falls back to the shared default model
- In-process report cache (keyed by "attachmentId + question"); repeat questions about the same image answer instantly
- Reuses the DeepSeek API key configured in dsh; images are only sent to the official DeepSeek vision model and never leave the DeepSeek ecosystem; zero residue (no files written, cache is process memory only)

