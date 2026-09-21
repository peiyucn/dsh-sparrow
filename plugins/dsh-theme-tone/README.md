# dsh-theme-tone

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

A background-tone layer under the official light/dark theme — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

DSH's official theme gives you one colour axis: light or dark. This plugin adds a second one underneath it — a **tone**, picked separately for each axis, so the light side and the dark side each get their own atmosphere. A tone repaints the app background, the sidebar, the glow falling across them, and everything that sits on top: menus, dialogs, cards. Picking **Default** leaves the official look untouched.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

Requires dsh 0.1.5-rc.2 — the exact official version line this release is built and verified against (newer lines, pre-releases in particular, are not covered) — and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-theme-tone` directly: that only downloads the package into some `node_modules` and does not register it with the DSH web profile. Use the `dsh plugin` command above, then restart DSH.

## Usage

Open **Settings → General** — a **Tone** row sits directly under the official **Appearance** row. Four tones per axis, plus **Default**:

| Axis | Tones |
| :--- | :--- |
| Dark | Default, Space (blue-violet), Ember (red), Glade (green) |
| Light | Default, Frost (blue), Sakura (pink), Moss (green) |

* The row shows the tones for the **current** axis; switching light/dark refreshes it in place
* Each axis remembers its own choice, so switching to light and back keeps your dark tone
* Each card previews the tone it applies — what you pick is what you get
* Picking a tone takes effect immediately; no page reload
* **Default** changes nothing at all, so the untouched official look is always one click away

A tone reaches past the background: menus, dialogs and cards inherit its hue, hover / pressed / selected states, separators and scrollbars are tinted to match, and so are code blocks and the three cards above the composer (todo, goal, queued messages).

## Compatibility

* Targets dsh 0.1.5-rc.2 — the exact official version line this release is built and verified against (other lines are not covered)
* Purely visual: it never blocks the UI or changes how anything works
* If the host or the browser is missing something it needs, it disables itself with a user-facing warning instead of half-working

## Screenshots

The new-session page on each axis — dark, then light:

![Dark axis on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![Light axis on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## Uninstall & leftovers

* Uninstalling removes everything the plugin added; the settings row disappears and the look returns to the official one
* Your selection stays in `$DSH_HOME/settings.yaml` under `ui-theme-tone` but has no effect after removal — delete that section if you want it gone

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.md)
