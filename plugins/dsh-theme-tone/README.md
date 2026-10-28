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
* **Glass** — translucent frosted glass on the conversation header and the right sidebar's top bar, so the background light shows through them and content scrolls, blurred, underneath.

**Default** leaves the official theme completely untouched.

## Compatibility

* Targets dsh 0.2.1-rc.4 — the exact official version line this release is built and verified against (other lines are not covered)
* Appearance only: it never blocks the UI or changes how anything works; menus, dialogs and docked cards keep the official material
* When the host or the browser is missing something it needs, the plugin steps aside: the UI opens normally and it draws nothing (it also logs a user-facing warning)

## Screenshots

![Dark theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![Light theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## Uninstall & leftovers

* Uninstalling removes everything the plugin added; the settings row disappears and the look returns to the default one
* Your selection stays in `$DSH_HOME/settings.yaml` under `dsh-theme-tone` but has no effect after removal — delete that section if you want it gone

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.md)
