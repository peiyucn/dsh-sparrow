# dsh-codebuddy-credits

[简体中文](./README.zh-CN.md)

Company CodeBuddy credits as a DeepSeek Harness (DSH) LLM provider — your
enterprise-issued CodeBuddy quota, used directly inside DSH. Official API key
only: models as a provider, **no agent harness, no login/token reverse
engineering**.

The plugin registers a `codebuddy-credits` provider in the DSH model picker.
DSH runs its own agent loop (tools, permissions, context); CodeBuddy only
serves inference, billed to your CodeBuddy account.

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

## Configure

The plugin resolves the key from the `CODEBUDDY_API_KEY` environment variable
by default, or from the key stored in DSH's credential service:

- **Settings → Models → codebuddy-credits**: the apiKeyEnv field is a
  credential reference — paste the key there to store it in the DSH credential
  vault (never written to settings.yaml), or leave it and export
  `CODEBUDDY_API_KEY` in your launching environment.

The provider ships a built-in model catalog (hy4-preview, hy3, hy3-x,
glm-5.3-flash, minimax-m3-pay, deepseek-v4-flash). To sync with what your
account can actually use, open **Settings → Models → codebuddy-credits →
Get available models** — the plugin queries the CodeBuddy catalog endpoint
with your key and offers the result for adoption.

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
