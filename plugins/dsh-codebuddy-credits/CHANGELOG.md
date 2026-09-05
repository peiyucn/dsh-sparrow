# Changelog

All notable user-facing changes are documented here.
See [简体中文](./CHANGELOG.zh-CN.md).

## 0.1.2-rc.1 (2026-09-05)

- Initial release: company CodeBuddy credits as a DSH LLM provider — official API key only, streaming only
- Configure on the **CodeBuddy Credits** row in Settings → Models: saving validates the catalog with the key before storing it, clearing the key deactivates the provider, and the official credential dot works natively
- CodeBuddy-aware model picker variant: each model row shows its credit rate (`x0.79`, `free`) on the right, and reasoning-effort choices follow the server's per-model declarations
- The model catalog follows the saved key entirely (fetched on save, refreshed in the background); it is never written to settings, and no network request is made without a key
- Credits entry in the conversation header (top-right, next to the Session log button) — shown on conversation pages and the new-session page alike: the panel shows account/enterprise, current-cycle quota (used / limit / remaining, progress bar, reset date), and the selected model's description, capabilities, and spend rate; a subtle 🐦 dsh-sparrow brand line closes the panel
- Session credits appended to the official stats line under the composer, plus a per-turn credit pill with the per-call breakdown (both in-memory and reset when DSH restarts)
- Credential reference aligned with the official derived name `CODEBUDDY_CREDITS_API_KEY`; the earlier `CODEBUDDY_API_KEY` is still recognized and migrated automatically
- Image input for vision-capable models, sent as OpenAI-style data URLs through the official attachment seam (official 2000px compression budget)
