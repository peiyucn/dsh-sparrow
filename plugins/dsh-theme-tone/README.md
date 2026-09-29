# dsh-theme-tone

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Tone skins for the official light and dark themes, plus conversation-area layout tuning once a tone is picked — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone
```

Requires dsh 0.2.0-rc.1 — the exact official version line this release is built and verified against (newer lines, pre-releases in particular, are not covered) — and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-theme-tone` directly: that only downloads the package into some `node_modules` and does not register it with the DSH web profile. Use the `dsh plugin` command above, then restart DSH.

## Usage

Open **Settings → General** — a **Tone** row sits directly under the official **Appearance** row. Light and dark each get four skins, plus a **Default**:

| Appearance | Skins |
| :--- | :--- |
| Dark | Default (official black), Space, Ember, Glade |
| Light | Default (official white), Frost, Sakura, Moss |

Picking any tone other than **Default** also tunes the conversation layout (on **Default** everything stays exactly as the official build):

* Turn navigation: the official build hides the rail entirely below a 900px conversation column; with a tone picked the breakpoint moves to 700px, and below 700px the rail is hidden by default and fades in on hover over the right edge (or keyboard focus) — no frame, no background
* Conversation content clearance: on wide columns at least 120px per side (official: 88px); on narrow columns the content clamps to the official 640px minimum so the right drag handle no longer crowds the rail

It also fixes a small official glitch (**no tone needed — active on both**): hovering either "resize conversation" drag handle left the official vertical glow sitting low (it only snapped to the pointer once you held the button down); the glow now follows the pointer on hover too.

## Compatibility

* Targets dsh 0.2.0-rc.1 — the exact official version line this release is built and verified against (other lines are not covered)
* Appearance only: it never blocks the UI or changes how anything works
* When the host or the browser is missing something it needs, the plugin steps aside: the UI opens normally and it draws nothing (for a missing theme, slot, or browser feature it also logs a user-facing warning)

## Screenshots

![Dark theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png)

![Light theme on the new-session page](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png)

## Uninstall & leftovers

* Uninstalling removes everything the plugin added; the settings row disappears and the look returns to the official one
* Your selection stays in `$DSH_HOME/settings.yaml` under `ui-theme-tone` but has no effect after removal — delete that section if you want it gone

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-theme-tone/CHANGELOG.md)
