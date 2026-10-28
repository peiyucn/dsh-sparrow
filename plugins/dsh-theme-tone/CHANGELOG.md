# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## [0.2.1-rc.4] - 2026-10-28

- Now adapted to official dsh 0.2.1-rc.4 (web and desktop).

## [0.2.1-rc.3] - 2026-10-24

- Now adapted to official dsh 0.2.1-rc.3 (web and desktop).

## [0.2.1-rc.2.1] - 2026-10-22

- The tone skins no longer draw the noise/grain texture over the background. It is a visible change: surfaces read cleaner, especially over large empty areas in dark mode.
- Scrolling is noticeably smoother — most of all when several conversations are running at once.
- Switching between conversations is smoother too.

## [0.2.1-rc.2] - 2026-10-18

- Now adapted to official dsh 0.2.1-rc.2 (web and desktop).
- The "settings cannot be saved" warning now says the right reason on the new dsh (the old non-loopback wording no longer applies).
- Scrolling and replies that are still generating (thinking) are smoother: streaming text no longer triggers the plugin's full re-measure on every update — it waits for the stream to settle, so long conversations no longer get slower as more content is shown.
- The "model updated" notice card is no longer covered or tinted by the tone layers; it now matches the other floating panels.

## [0.2.0-rc.2] - 2026-10-08

- Now adapted to official dsh 0.2.0-rc.2 (web and desktop).
- Menu and pop-up panels are translucent and blurred like the rest of dsh, instead of an opaque surface.
- The dsh-nav-pin plugin has been merged into this one: with a tone picked, narrow windows keep the turn navigation, and content gets more side margin. Installing dsh-nav-pin separately is no longer needed.
- Scrolling is smoother while the model is replying, including while it is thinking.

## [0.1.5-rc.2] - 2026-09-22

- First release.
- A Tone row under Appearance in Settings → General, with separate light and dark choices.
- Several tone skins: dark offers Space, Ember and Glade; light offers Frost, Sakura and Moss.
