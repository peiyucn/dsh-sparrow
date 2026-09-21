# dsh-theme-tone

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

A background-tone layer under the official light/dark theme — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

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
| Dark | Default (the official dark), Space, Ember, Glade |
| Light | Default (the official light), Frost, Sakura, Moss |

## Compatibility

* Targets dsh 0.1.5-rc.2 — the exact official version line this release is built and verified against (other lines are not covered)
* Purely visual: it never blocks the UI or changes how anything works
* If the host or the browser is missing something it needs, it disables itself with a user-facing warning

## Screenshots

![Dark axis on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![Light axis on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## Uninstall & leftovers

* Uninstalling removes everything the plugin added; the settings row disappears and the look returns to the official one
* Your selection stays in `$DSH_HOME/settings.yaml` under `ui-theme-tone` but has no effect after removal — delete that section if you want it gone

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.md)
