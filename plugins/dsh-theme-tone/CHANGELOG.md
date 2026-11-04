# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## [0.2.2-rc.1] - 2026-11-05

- The composer glass keeps the previous version's look (16px frost, 62% veil, edge light, transcript scrolling underneath); on dsh 0.2.2 an occasional block flash may appear over the input area while the session is thinking or streaming — a known limitation kept as-is in favour of the original look.
- The composer seat only drops the official input mask and returns to the previous version's compositing conditions; the footer cover strips and docked-card gaps now blend with the page light instead of showing a dark bar.
- Menus keep the official translucent material and open/close animations, staying consistent with other menus.
- The right sidebar header is one continuous frosted bar again with the page content scrolling underneath it; the file page keeps its real header (path, reload and file actions) with the file tree no longer shifted down.
- Keeps the previous version's behaviour: the transcript still scrolls under the composer glass, and the 1017 badge next to the model falls back to the legacy condition when the server listing provides no badge.
- Now adapted to official dsh 0.2.2-rc.1 (web and desktop).

## [0.2.1-rc.5] - 2026-10-30

- Now adapted to official dsh 0.2.1-rc.5 (web and desktop).
- Reworked the frosted-glass look: the composer is brighter with symmetric edge light and a softer float, and the top bars now carry the same warm page light as the rest of the page.
- Cleaned up the accompanying details: no more see-through or stray bars around the composer and the docked cards, the right sidebar scrollbar starts below its top bar, and the @ / slash suggestion list now fades its items instead of showing an extra bar.

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
