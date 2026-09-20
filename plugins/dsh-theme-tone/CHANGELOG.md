# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.5-rc.2 (2026-09-18)

- First release, published to the `latest` channel.
- A **Tone** row in Settings → General, directly under the official Appearance row; each axis (light / dark) picks its own tone and remembers it independently.
- Four tones per axis plus **Default**: dark = Space (blue-violet), Ember (red), Glade (green); light = Frost (blue), Sakura (pink), Moss (green). **Default** overrides no tokens and paints no layer, so an untouched official look is always one click away.
- Each tone repaints the app background, the sidebar fill and a soft glow (upper light, lower depth, left-sidebar halo), plus a fine grain texture.
- The dark axis uses the pyai.site deep-space palette (near-black ground, one warm-gold light source); the light axis mirrors it with an official white ground lit by the tone's own colour.
- Raised surfaces — menus, dialogs and elevated cards — inherit the tone's hue; interactive states, separators and scrollbars are tinted to match.
- **Inset grey surfaces** — code blocks and the three cards above the composer (todo / goal / queued messages) — are tinted with the tone's hue, one step heavier than the page background so their edges read at a glance.
- The **run sweep** that travels across a running row is repainted from this plugin's own background, so it no longer shows up as a flat block on a tinted ground.
- The **hover preview card** (whose background and text colours the official UI hard-codes) is re-tinted so it follows the theme instead of staying a fixed dark grey.
- On the new-session page, before a workspace is chosen, the composer card hands its edge back to the official dashed ring: the plugin drops its own lift and rim light so the dashed ring is the only border.
- The two round buttons inside the composer (`+` command palette / attachments) no longer carry a solid fill by default, revealing the card's own glass; the hover fill stays.
- Glass treatment for the top bar and the composer: the composer becomes a translucent blurred card floating over the background, with a seam blocker so scrolled text no longer shows through the gap between docked cards.
- The **right panel** repaints the background's light and grain itself (it sits above the content layer and would otherwise miss them).
- The **drag handle** no longer covers the top bar while scrolling a conversation.
- Tone cards preview each tone (background + both glows + the left halo) instead of showing a flat colour.
- If the host is missing a capability the plugin needs it does not start; if the browser lacks the CSS the background layer needs, the plugin disables itself with a user-facing warning.
