# dsh-codebuddy-credits

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Company CodeBuddy credits as a DeepSeek Harness (DSH) LLM provider — your
enterprise-issued CodeBuddy quota, used directly inside DSH. API key only:
CodeBuddy provides the model inference your credits pay for, while tools,
permissions and context stay with DSH.

The plugin adds a `CodeBuddy Credits` provider to the DSH model picker.

## Why

Companies issue WorkBuddy/CodeBuddy credits that can only be spent inside the
CodeBuddy ecosystem. If you prefer DSH as your agent harness, this plugin
spends those credits where you want them — with an API key, without borrowing
browser logins or installing the CodeBuddy CLI.

## Requirements

- DSH 0.2.0-rc.2 (the exact official version line this release is built and verified against; newer lines, pre-releases in particular, are not covered)
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

- Saving the key loads the models that key can use (they follow the key's
  account permissions — e.g. the set your enterprise admin granted) and turns
  the provider on. The list is kept in memory and refreshed on demand; it is
  never written to settings.
- Once configured, the card also lists the models the key can use (read-only:
  plain name + `x0.00 · 1M` credit rate · context window) with a **Fetch
  available models** button, so you can refresh after an administrator changes
  the list. Refreshing only affects this provider.
- The models then appear in the model picker. Each model row shows the plain
  model name with its credit rate and context window on the right
  (`x0.00 · 1M`), and the available reasoning levels come from the server.
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
  CodeBuddy model's credit rate, context window, description and capabilities.
  When the conversation area gets narrow this entry automatically collapses to
  the **icon-only, text-free** version;
- **Session credits**: shown in the stats row under the composer, together
  with the accumulated credits and call count for the current conversation;
  clicking it opens the call count and the per-model breakdown.
- **Per-turn credits**: credits spent for one assistant turn (at the end
  of its action row), with a popup breaking the total down per call and per
  model.

Session and per-turn figures are kept from the session's own history, so
they survive a DSH restart and stay correct when you reopen an older session;
the quota panel always reads the latest number from the server.

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

## License

[MIT](./LICENSE)

## Changelog

[CHANGELOG.md](./CHANGELOG.md)
