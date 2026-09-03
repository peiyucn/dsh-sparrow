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

- DSH >= 0.1.2-alpha.4
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
  granted), writes the result to settings, and activates the provider;
- the models then appear in the model picker;
- without a key the plugin makes no network requests at all and the provider
  does not appear in the model picker;
- removing the key deactivates the provider.

The `CODEBUDDY_API_KEY` environment variable still works (read at startup),
but saving in the UI is the recommended path; the key lives only in the DSH
credential vault, never in settings.yaml.

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
