# dsh-theme-tone

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Tone skins for DSH's built-in light and dark themes — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

Requires dsh 0.2.1-rc.4 — the exact official version line this release is built and verified against. Also requires a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-theme-tone` directly: that only downloads the package into some `node_modules` and does not register it with the DSH web profile. Use the `dsh plugin` command above, then restart DSH.

## Usage

Open **Settings → General** — a **Tone** row sits directly under the **Appearance** row. Light and dark each get four skins plus a **Default**:

| Appearance | Skins |
| :--- | :--- |
| Dark | Default, Space, Ember, Glade |
| Light | Default, Frost, Sakura, Moss |

Each tone paints:

* **Colors** — the whole app (background, raised surfaces, labels, borders, scrollbars) is re-tinted through the official theme token layer.
* **Ground light** — a fixed decorative layer with three soft lights (top, bottom, left), with the light's position and direction fixed per tone.
* **Frosted glass** — the composer, the conversation header and the right sidebar's top bar are translucent frosted glass. The top bars keep their official borders and carry the same warm page light as the rest of the page; the composer is brighter, its edge light is symmetric (brightest along the middle of each edge) and it floats on a soft shadow.
* **No opaque footer band, no bleed-through** — the solid strip the composer used to sit on is removed, so the page ground light shows through instead; scrolled conversation is masked behind the composer's lower edge, its status capsule row and the dock cards above it (to-do / goal / queued messages), so nothing leaks through the gaps — including the bottom of the window when the right sidebar is open.
* **Consistent secondary surfaces** — the docked cards use an opaque raised surface so stacked cards look the same, model-picker group headings stay solid while scrolling, and the @ / slash suggestion list fades its own items at the edge while more results remain.

The docked cards, model-picker group headings and the @ / slash suggestion list keep the material and hint fixes under every tone, including **Default**.

**Default** leaves the official theme and the glass effects completely untouched.

## Compatibility

* Targets dsh 0.2.1-rc.4 — the exact official version line this release is built and verified against (other lines are not covered)
* Appearance only: it never blocks the UI or changes how anything works; menus and dialogs keep the official material (docked cards, model-picker group headings and the @ / slash suggestion list get the solid-surface treatment described above)
* When the host or the browser is missing something it needs, the plugin steps aside: the UI opens normally and it draws nothing (it also logs a user-facing warning)

## Screenshots

![Dark theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![Light theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## Uninstall & leftovers

* Uninstalling removes everything the plugin added; the settings row disappears and the look returns to the default one
* Your selection stays in `$DSH_HOME/settings.yaml` under `dsh-theme-tone` but has no effect after removal — delete that section if you want it gone

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.md)
