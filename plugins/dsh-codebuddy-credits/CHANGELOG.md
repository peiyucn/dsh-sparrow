# Changelog

All notable user-facing changes are documented here.
See [简体中文](./CHANGELOG.zh-CN.md).

## 0.1.5-rc.2.1 (2026-09-11)

- The session credit summary now sits in the composer's stats row as a pill of the same kind as the official ones (brand mark + `Credits N · M calls`) — same size, colours and hover — and clicking it opens the call count with the per-model breakdown. A conversation with no CodeBuddy calls still gets nothing added.
- The settings card, the credits panel and the model picker now read one shared model catalog, so **Fetch available models** updates all three at once.
- Saving a key now reads the account context before the model catalog, so the first catalog request already carries the right enterprise headers.
- A credit rate just below a million no longer reads `1000K` — it shows `1M`.
- Provider requests can no longer hang: status, save, re-scan, quota and turn-usage calls all give up after a timeout instead of waiting forever.
- Replacing or clearing the API key no longer lets a refresh that was already in flight write the old account or the old model list back.

## 0.1.5-rc.2 (2026-09-10)

- Version-line alignment with official dsh 0.1.5-rc.2.
- A usage frame that arrives after the stream's final frame is now accounted for instead of being dropped, so session credit totals stay accurate.
- The settings card now lists the models your CodeBuddy key can use, with a "Fetch available models" button to re-scan on the spot after an administrator changes them (read-only; no other provider is touched).
- Model names no longer carry a credit-rate suffix (a zero rate no longer reads `free`); the settings list, the model picker and the credits panel now all show the plain model name with its read-only facts (`x0.00 · 1M` — credit rate · context window) on the right.

## 0.1.2-rc.1.2 (2026-09-09)

- If dsh is upgraded to a version this plugin does not support yet, the plugin now disables itself instead of running against an unknown contract (dsh and other plugins are unaffected).
- Images now reach vision-capable models reliably: previously the model replied that it could not see images even though the model supports them.

## 0.1.2-rc.1.1 (2026-09-07)

- **Max mode** (reasoning-effort lock, same idea as the CodeBuddy client's toggle): a switch in the credits panel (above the model card) — once on, every reasoning model in this provider sends the Max effort level; the model picker's effort list shows Max pinned on top with the other levels greyed out until the lock is released
- Models outside this provider (the official DeepSeek route and others) are never affected by the lock

## 0.1.2-rc.1 (2026-09-05)

- Initial release: company CodeBuddy credits as a DSH LLM provider — official API key only, streaming only
- Configure on the **CodeBuddy Credits** row in Settings → Models: saving validates the catalog with the key before storing it, clearing the key deactivates the provider, and the official credential dot works natively
- CodeBuddy-aware model picker variant: each model row shows its credit rate (`x0.79`, `free`) on the right, and reasoning-effort choices follow the server's per-model declarations
- The model catalog follows the saved key entirely (fetched on save, refreshed in the background); it is never written to settings, and no network request is made without a key
- Credits entry in the conversation header (top-right, next to the Session log button) — shown on conversation pages and the new-session page alike: the panel shows account/enterprise, current-cycle quota (used / limit / remaining, progress bar, reset date), and the selected model's description, capabilities, and spend rate; a subtle 🐦 dsh-sparrow brand line closes the panel
- Session credits appended to the official stats line under the composer, plus a per-turn credit pill with the per-call breakdown (both in-memory and reset when DSH restarts)
- Credential reference aligned with the official derived name `CODEBUDDY_CREDITS_API_KEY`; the earlier `CODEBUDDY_API_KEY` is still recognized and migrated automatically
- Image input for vision-capable models, sent as OpenAI-style data URLs through the official attachment seam (official 2000px compression budget)
