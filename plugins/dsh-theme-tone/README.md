# dsh-theme-tone

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Tone skins for the official light and dark themes — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

Requires dsh 0.1.5-rc.2 — the exact official version line this release is built and verified against (newer lines, pre-releases in particular, are not covered) — and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-theme-tone` directly: that only downloads the package into some `node_modules` and does not register it with the DSH web profile. Use the `dsh plugin` command above, then restart DSH.

## Usage

Open **Settings → General** — a **Tone** row sits directly under the official **Appearance** row. Light and dark each get four skins, plus a **Default**:

| Appearance | Skins |
| :--- | :--- |
| Dark | Default (official black), Space, Ember, Glade |
| Light | Default (official white), Frost, Sakura, Moss |

## Compatibility

* Targets dsh 0.1.5-rc.2 — the exact official version line this release is built and verified against (other lines are not covered)
* Appearance only: it never blocks the UI or changes how anything works
* When the host or the browser is missing something it needs, the plugin steps aside: the UI opens normally and it draws nothing (for a missing theme, slot, or browser feature it also logs a user-facing warning)

## Screenshots

![Dark theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![Light theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## Uninstall & leftovers

* Uninstalling removes everything the plugin added; the settings row disappears and the look returns to the official one
* Your selection stays in `$DSH_HOME/settings.yaml` under `ui-theme-tone` but has no effect after removal — delete that section if you want it gone

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.md)
