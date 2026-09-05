# dsh-codebuddy-credits

[简体中文](./README.zh-CN.md)

Company CodeBuddy credits as a DeepSeek Harness (DSH) LLM provider — your
enterprise-issued CodeBuddy quota, used directly inside DSH. Official API key
only: models as a provider, **no agent harness, no login/token reverse
engineering**.

The plugin registers a `CodeBuddy Credits` provider (route
`codebuddy-credits`) in the DSH model picker. DSH runs its own agent loop
(tools, permissions, context); CodeBuddy only serves inference, billed to your
CodeBuddy account.

## Why

Companies issue WorkBuddy/CodeBuddy credits that can only be spent inside the
CodeBuddy ecosystem. If you prefer DSH as your agent harness, this plugin
spends those credits where you want them — through the official API key
mechanism, without borrowing browser logins or the CodeBuddy CLI.

## Requirements

- DSH >= 0.1.2-rc.1
- Node.js >= 22.19.0

## Install

```powershell
dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits@latest
```

Restart DSH afterwards. For headless use, repeat with `--profile headless`.

## Get an API key

1. Log in to the CodeBuddy platform: <https://copilot.tencent.com/profile/>
   (enterprise console: API Management → Access Keys) or the international
   equivalent at <https://www.codebuddy.ai/profile/keys>.
2. Create a key. Enterprise keys are issued per account; model availability
   follows your account's permissions.

## Configure (in the UI)

Open **Settings → Models** and paste your key on the **CodeBuddy Credits** row:

- Saving the key queries the CodeBuddy model catalog with that key (models
  follow the key's account permissions — e.g. the set your enterprise admin
  granted) and activates the provider. The catalog is held in memory and
  refreshed on demand; it is never written to settings.
- The models then appear in the model picker. The picker is a
  CodeBuddy-aware variant of the official one: each model row shows its credit
  rate (`x0.79`, `free`) on the right, and reasoning-effort choices follow
  what the server declares per model.
- Without a key the plugin makes no network requests at all and the provider
  does not appear in the model picker.
- Removing the key deactivates the provider.

The key lives only in the DSH credential vault, never in settings.yaml. The
`CODEBUDDY_CREDITS_API_KEY` environment variable is also read at startup; the
earlier `CODEBUDDY_API_KEY` spelling still resolves and is migrated
automatically. Saving in the UI is the recommended path.

## Credit visibility

Once a key is configured, the plugin surfaces your CodeBuddy usage in the
conversation UI:

- **Header entry** (top-right of the conversation column, next to the
  Session log button — shown on conversation pages and on the new-session
  page alike): opens a panel with your account/enterprise, current-cycle
  quota (used / limit / remaining, progress bar, reset date) and the selected
  CodeBuddy model's description, capabilities, and spend rate.
- **Session stats**: accumulated credits and call count for the current
  conversation, appended to the official stats line under the composer.
- **Per-turn credit pill**: credits spent for one assistant turn (at the end
  of its action row), with a popup breaking the total down per call and per
  model.

Session and per-turn figures are accumulated in memory and reset when DSH
restarts; the quota panel always reads the authoritative server-side number.

## Screenshots

![Credits entry and quota panel on the session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits.png)

![CodeBuddy Credits configuration card in Settings → Models](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits-settings.png)

## Honest limitations

- The inference endpoint is the one the official CodeBuddy CLI uses. The key
  is officially issued and the authentication method is documented in the
  official IAM docs, but **the chat endpoint itself has no public stability
  promise**. This plugin is a third-party adapter, not an official product.
- The endpoint serves **streaming only**; non-streaming requests are rejected.
- Model pricing follows your account: hy models are currently free on many
  enterprise plans, minimax-m3-pay is billed. Policies change without notice.
- Requests made through your key appear in your account's usage records
  (including prompt text in the enterprise usage console).

## Relationship to other projects

- [dsh-llm-codebuddy](https://github.com/Axiaohungry/dsh-llm-codebuddy):
  token-reverse-engineering + API-key dual mode. This plugin deliberately
  keeps only the official API-key path.
- Official CodeBuddy Agent SDK / HTTP API: agent-level integrations (CodeBuddy
  runs its own loop). This plugin is the opposite shape — DSH runs the loop.

## License

[MIT](./LICENSE)

## Changelog

[CHANGELOG.md](./CHANGELOG.md)
