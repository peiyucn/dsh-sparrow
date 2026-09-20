# dsh-theme-tone

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

A background-tone layer under the official light/dark theme — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

DSH's official theme gives you one colour axis: light or dark. This plugin adds a second, orthogonal one: a **tone** picked independently for each axis, so the light side and the dark side can each carry their own mood. Picking a tone repaints the app background, the sidebar fill and the glow that falls across them, and the tone carries through to menus, dialogs and cards as well. Switching to **Default** puts everything back to the untouched official look.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

Requires dsh 0.1.5-rc.2 — the exact official version line this release is built and verified against (newer lines, pre-releases in particular, are not covered) — and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-theme-tone` directly: that only downloads the package into some `node_modules` and does not register it with the DSH web profile. Use the `dsh plugin` command above, then restart DSH.

## Usage

Open **Settings → General**. A **Tone** row sits directly under the official **Appearance** row.

* The row shows the tones for the **current** axis only; switching light/dark refreshes it in place
* Each axis stores its own choice, so switching to light and back keeps your dark tone
* Four tones per axis, plus **Default**:

| Axis | Tones |
| :--- | :--- |
| Dark | Default, Space (blue-violet), Ember (red), Glade (green) |
| Light | Default, Frost (blue), Sakura (pink), Moss (green) |

* **Default** changes nothing at all — no tokens are overridden and no background layer is painted, so you always have an untouched official look to compare against
* Each card previews the tone it applies, so what you pick is what you get
* Picking a tone takes effect immediately; no page reload

Because both axes are available, the plugin never forces you onto a tone — uninstalling it (or selecting Default on both axes) restores the official appearance exactly.

## What the tone drives

* The app background and the sidebar fill
* A soft glow across the screen (upper light, lower depth, and a halo over the left sidebar)
* A fine grain texture
* Raised surfaces — menus, dialogs and elevated cards — inherit the tone's hue; interactive states, separators and scrollbars are tinted to match
* Inset grey surfaces — code blocks and the three cards above the composer (todo, goal, queued messages) — sit one step heavier than the page background, so their edges read at a glance

The dark axis keeps the deep-space palette from [pyai.site](https://pyai.site) — a near-black ground with a single warm-gold light source. The light axis mirrors that structure with an official white ground lit by the tone's own colour.

## Compatibility

* Targets dsh 0.1.5-rc.2 — the exact official version line this release is built and verified against (other lines are not covered)
* If the host is missing a capability this plugin depends on (`ctx.theme.overrideTokens`, `ctx.settingsScope`, `ctx.slots` or `ctx.locale`), the plugin disables itself with a user-facing warning instead of running against an unknown contract — dsh and your other plugins are unaffected
* If the browser lacks a CSS feature the glass effect needs, the plugin similarly disables itself rather than injecting rules that cannot work
* The plugin never touches official DOM structure, official React components, or hashed CSS-module class names

## Screenshot

![Dark axis on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone.png)

## Uninstall & leftovers

* Uninstalling removes the token overrides, the background layer and the injected stylesheet; the settings row disappears and the look returns to the official one
* Your selection stays in `$DSH_HOME/settings.yaml` under `ui-theme-tone` but has no effect after removal — delete that section if you want it gone

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.md)
