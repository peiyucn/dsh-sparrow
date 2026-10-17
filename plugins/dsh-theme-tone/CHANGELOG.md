# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.2.1-rc.2 (2026-10-17)

- Now adapted to official dsh 0.2.1-rc.2 (web and desktop).
- The "settings cannot be saved" warning now says the right reason on the new dsh (the old non-loopback wording no longer applies).
- Scrolling and replies that are still generating (thinking) are smoother: streaming text no longer triggers the plugin's full re-measure on every update.
- The "model updated" notice card is no longer covered or tinted by the tone layers; it now matches the other floating panels.
- In an embedded browser (for example the VS Code built-in Simple Browser) the plugin now switches itself to a performance mode: tone colours stay, while the glass blur, the background layer and the panel texture are turned off. Scrolling and thinking are much smoother there; a standalone browser keeps the full look.

## 0.2.0-rc.2 (2026-10-08)

- Now adapted to official dsh 0.2.0-rc.2 (web and desktop).
- Menu and pop-up panels are translucent and blurred like the rest of dsh, instead of an opaque surface.
- The dsh-nav-pin plugin has been merged into this one: with a tone picked, narrow windows keep the turn navigation, and content gets more side margin. Installing dsh-nav-pin separately is no longer needed.
- Scrolling is smoother while the model is replying, including while it is thinking.

## 0.1.5-rc.2 (2026-09-21)

- First release.
- A Tone row under Appearance in Settings → General, with separate light and dark choices.
- Several tone skins: dark offers Space, Ember and Glade; light offers Frost, Sakura and Moss.
