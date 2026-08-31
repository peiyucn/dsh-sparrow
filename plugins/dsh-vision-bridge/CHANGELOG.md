# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- Renamed package from `@dsh-sparrow/dsh-vision-access` to `@dsh-sparrow/dsh-vision-bridge` (locale namespace and other internal identifiers aligned; the old name was never published, no migration cost)
- First published version, released to the `next` channel for owner validation before the stable `0.1.0`
- `vision_read` tool: the main model calls it automatically after an image is pasted; the host reads the image directly with the official vision model (default deepseek-v4-flash-vision-exp) and returns a structured text report (summary / OCR / tables / layout); goes through `ctx.llm` instead of a subagent (measured 2.2s vs 46.3s)
- Hidden per agent conditionally: when the main model is not a DeepSeek model, or natively understands images, that agent cannot see `vision_read` (as if the tool did not exist)
- Status icon: a three-state eye beside the model selector (native vision greyed out / DeepSeek text lit / no-vision slashed); clicking shows the matching explanation, and it follows model switches live; with no model info on a new session it falls back to the shared default model
- In-process report cache (keyed by "attachmentId + question"); repeat questions about the same image answer instantly
- Reuses the DeepSeek API key configured in dsh; images are only sent to the official DeepSeek vision model and never leave the DeepSeek ecosystem; zero residue (no files written, cache is process memory only)
