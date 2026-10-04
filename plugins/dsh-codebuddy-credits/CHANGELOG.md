# Changelog

All notable user-facing changes are documented here.
See [简体中文](./CHANGELOG.zh-CN.md).

## 0.2.0-rc.2 (2026-09-30)

- Version-line alignment with official dsh 0.2.0-rc.2.
- The session credits tag under the composer now matches the tags beside it.
- Loading now shows a loading indicator instead of the "Loading…" text.
- Fixed the plugin not working after the dsh 0.1.7 upgrade.
- Fixed credits resetting after a restart.
- Fixed the CodeBuddy entry overlapping the top-right button on the new-session page.
- Fixed the wrong background and hover colour on grouped model-picker titles.
- The CodeBuddy entry shrinks to an icon-only logo on narrow layouts.
- Fixed the credits panel briefly appearing in the wrong place.
- The new-session page entry now shrinks to the icon-only logo too.

## 0.1.5-rc.2.2 (2026-09-21)

- Credits no longer reset after a restart, and older sessions keep their full totals.
- The credit dialog is narrower.
- Clicking the user name in the credit dialog opens your CodeBuddy profile.

## 0.1.5-rc.2.1 (2026-09-11)

- Session credits now appear in the composer's stats row; clicking shows the per-model breakdown.
- **Fetch available models** now updates the settings card, credits panel and model picker together.
- Saving a key now loads your account's model list correctly the first time.
- A credit rate just below a million now shows `1M` instead of `1000K`.
- Requests no longer hang; they time out instead of waiting forever.
- Changing or clearing the key no longer brings back the old account or model list.

## 0.1.5-rc.2 (2026-09-10)

- Version-line alignment with official dsh 0.1.5-rc.2.
- Fixed session credit totals sometimes missing the last part of a reply.
- The settings card now lists the models your key can use, with a **Fetch available models** button.
- Model names no longer carry a credit-rate suffix; the rate and context window now appear separately.

## 0.1.2-rc.1.2 (2026-09-09)

- The plugin now disables itself on dsh versions it does not support.
- Fixed images not reaching vision-capable models.

## 0.1.2-rc.1.1 (2026-09-07)

- **Max mode**: a switch in the credits panel locks all reasoning models to Max effort.
- The lock does not affect models from other providers.

## 0.1.2-rc.1 (2026-09-05)

- Initial release: use your company CodeBuddy credits as an LLM provider in DSH.
- Configure it on the **CodeBuddy Credits** row in Settings → Models; clearing the key disables the provider.
- The model picker shows each model's credit rate and its available reasoning levels.
- The model list follows your saved key; without a key no network requests are made.
- A credits entry in the conversation header opens a panel with your account and current-cycle quota.
- Session credits appear in the stats row under the composer, plus a per-turn credit tag.
- The credential is now named `CODEBUDDY_CREDITS_API_KEY`; the old name still works and migrates automatically.
- Images can now be sent to models that support them.
