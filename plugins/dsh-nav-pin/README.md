# dsh-nav-pin

> **⚠️ Retired (2026-09-29)** — this plugin has been merged into **`dsh-theme-tone`**. Do **not** install it on new setups.
>
> **Already installed it? Remove it.** With both installed the layout rules simply stack (the merged copy is gated on a theme tone, this one is not), so nothing breaks — but you keep a redundant package and its stylesheet:
>
> ```bash
> dsh plugin --profile web remove @dsh-sparrow/dsh-nav-pin
> ```
>
> To keep the behavior, install `dsh-theme-tone` and pick any tone: the turn-navigation fix ships inside it. The drag-handle glow fix is **not** gated, so it stays active on the official default tone too. Navigation and width clamping apply once a tone other than "official" is selected.
>
> The rest of this document is kept for historical reference.

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Turn navigation that stays on narrow conversations — a DeepSeek Harness (DSH) web plugin (dsh-sparrow collection member).

The official turn navigation (the tick rail on the right side of a conversation that jumps between turns) hides entirely once the conversation column is narrower than 900px. This plugin moves that breakpoint to 700px; below 700px the rail hides by default and fades in when you hover the right edge (or move keyboard focus into it) — no frame, no background, the same look as the wide layout — without taking any layout space.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin
```

~~Requires dsh 0.2.0-rc.1 — the exact official version line this release is built and verified against (newer lines, pre-releases in particular, are not covered) — and a working `pnpm` (`dsh plugin` forwards installation to pnpm).~~

> **No longer applies**: this plugin was retired at `0.1.5-rc.2` — it never shipped a release for 0.2.0-rc.1, and its behavior now lives in `dsh-theme-tone` (see the retirement notice at the top). The rest of this document is kept for historical reference.

> Do **not** run `npm install @dsh-sparrow/dsh-nav-pin` directly: that only downloads the package into some `node_modules` and does not register it with the DSH web profile. Use the `dsh plugin` command above, then restart DSH.

## Compatibility

* ~~Targets dsh 0.2.0-rc.1 — the exact official version line this release is built and verified against (other lines are not covered); the injected stylesheet at worst matches nothing (a no-op) and never breaks the UI~~
  * This plugin was retired at `0.1.5-rc.2` and never shipped for 0.2.0-rc.1; for this behavior install `dsh-theme-tone` and pick any tone.

## Usage

* No settings, no toggle: active as soon as it is installed
* Conversation column > 700px: the rail is always visible (the official 900px hide is overridden)
* Conversation column ≤ 700px: the rail is hidden by default; hover the right edge of the conversation (or Tab into the rail) and it fades in (~120ms) with no frame or background; moving away hides it again
* The conversation content width is capped: on wide columns even dragged to the widest it keeps at least 120px clearance per side (official: 88px); on narrow columns the content clamps to the official 640px minimum to make room for the rail, so the right drag handle no longer crowds the turn rail
* Also fixes a small official glitch: hovering either "resize conversation" drag handle left the official vertical glow sitting low (it only snapped to the pointer once you held the button down). The glow now follows the pointer on hover too, matching the 0.1.5 official feel
* **Note**: the official rail only renders from the second turn on — a single-turn session has no rail to pin, and this plugin does not change that threshold
* Uninstalling restores the official 900px behavior; no persisted state, no leftovers

## Screenshot

![Turn rail hover reveal](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-nav-pin.png)

## Uninstall & leftovers

* The plugin writes no files and touches no `.dsh` internals; it injects one stylesheet plus one passive pointer listener (the latter backs the drag-handle glow fix above), both removed with the plugin lifecycle
* No localStorage keys, no config residue

**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-nav-pin/CHANGELOG.md)
