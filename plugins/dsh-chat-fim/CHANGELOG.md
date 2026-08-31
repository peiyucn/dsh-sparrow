# Changelog

## 0.1.0-alpha.1 (2026-08-31 · pre-release)

- Renamed package from `@dsh-sparrow/dsh-chat-suggest` to `@dsh-sparrow/dsh-chat-fim` (decided 2026-09-01; route / locale namespace / storage keys and other internal identifiers aligned; the old name was unpublished, no migration cost)
- Switch label unified to **FIM** in both zh and en (was 续写 (zh, "continuation") / Suggest (en); decided 2026-09-01: industry-standard term + narrower button)
- First pre-release, published to the `next` channel for validation; features match the planned `0.1.0` first release

## 0.1.0 (2026-08-31 · stable)

- Moved to the `@dsh-sparrow` npm org scope, with 0.1.0 as the first stable version
- Fixed `scripts/bundle-client.mjs` to register the client bundle under the scoped package name in `__ModuleLoader__.load`, avoiding dsh client load failures
- `npm run verify` now checks that the client bundle registration id matches the package name
- Chat input suggestions: fired after a typing pause, shown in a floating card styled like the official @ candidate menu; **Tab** adopts, **Esc** dismisses (clicking works too); yields while the official @/slash trigger menu is open
- Upstream: DeepSeek **FIM completion (Beta)** (`/beta/completions` + speaker-transcribed prompt); the completion model **follows the main model** (auto: v4-pro / v4-flash, falls back to pro for vision etc.), the actual model and temperature are shown in the card corner
- **Three trigger sensitivity levels** (high / medium / low): pause 250/400/800ms, minimum draft (Chinese 4/8/12 chars, English 2/6/8 chars), embedded English half-word, trailing space, and sentence-end punctuation scale per level; the "dots + ▾" zone beside the pill is a separate sensitivity trigger area (clicking the whole zone opens the level menu without toggling the switch), the tooltip follows the level, and the choice persists locally
- Content-adaptive: the completion language **follows the draft**; suggestions are **truncated to one sentence** (stop at sentence-end punctuation); **Tab chaining** (High allows continuous Tab)
- Quality guards: role-switch discard, degenerate repetition, history echo (user prefix / assistant window), language consistency; when all candidates are filtered out, one retry at temperature 0.5, then silent empty if still none
- Switch off by default with local persistence; hidden entirely when the session's main model is not a DeepSeek model; reuses the DeepSeek API key configured in dsh (never enters the browser)
- **Works on the new-session page**: the data side mounts `conversation.input.dock` (the dsh shell does not render composer.dock in hero state; input.dock mounts in both states)
