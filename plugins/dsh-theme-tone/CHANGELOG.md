# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.2.0-rc.2 (2026-09-30)

- Version-line alignment with official dsh 0.2.0-rc.2.
- Fixed grouped menu section titles (model picker, command popup) losing their themed material on dsh 0.2.0-rc.2.
- Fixed the right sidebar's themed gradient being offset by the window caption on the Windows desktop app (the app pushes the panel down by the title bar, and the gradient did not follow).
- New: with a tone picked, the turn navigation **no longer disappears on a narrow conversation column** (the official 900px breakpoint moves to 700px; below that it fades in on hover over the right edge), and the conversation content keeps at least 120px clearance per side (official: 88px) so the right drag handle no longer crowds the rail. This is the former `dsh-nav-pin` plugin, now merged in (**inactive on the official Default tone**).
- Also fixes a small official glitch: hovering a "resize conversation" drag handle no longer leaves the glow sitting low — it follows the pointer (**active with no tone picked too**).
- Fixed a washed-out band on the right of the conversation that persisted once the right sidebar had been opened.
- Fixed the right sidebar's file preview being unable to scroll.
- Fixed missing texture and lighting on question cards, plan-review cards, the archive page and the cloud-files page, and the missing backdrop blur behind those two pages.
- Restored the modal mask blur (removed on purpose in official 0.1.7-rc.2, added back at your request).
- Fixed the dark band on an expanded "Think" row while it sticks, and the background band / colour bleeding on grouped section titles (model picker and friends).
- Fixed the top bar's glow being covered up, and uneven lighting strength across overlays.
- Fixed the composer and top-bar glass across both themes; the drag handle no longer clips through the top bar.
- Fixed conversation text showing through the composer card's rounded corners when no dock card (todo / goal / queue) sits above it.
- Fixed the Windows title bar reading as a seam against the themed sidebar below it: the native window-controls strip was painted a flat colour, so it now goes transparent and the themed backdrop shows through (**window buttons unchanged**).
- Fixed the right sidebar's top bar not matching the conversation header's material: it is no longer an unsmoothed grain layer, but translucent with blur, from the same recipe as the conversation header (both the tab strip and **each panel's own title row** — files, file preview, and so on). The panel's content now scrolls **underneath** those two rows, so the blur shows actual content passing behind it instead of reading as a flat dark plate — the two rows read as **one continuous surface**, with no seam across the middle, and the title row's own hairline separator is back.
- Fixed the right sidebar's scrollbar scrolling up into the translucent blur once that blur was added: the thumb now stays below the blur band.
- Fixed the header's **background-jobs popover having its right half cut off by the right sidebar**: the popover now sits fully inside the conversation column (it used to extend past the column, where the column's own clipping cut it off while the sidebar panel covered it).
- Fixed the trajectory page's colour and texture stopping short of the composer, which left a visible band under the input box.

## 0.1.5-rc.2 (2026-09-21)

- First release.
- A **Tone** row in Settings → General, directly under the official Appearance row: light and dark each pick their own and remember it independently.
- Ships several **tone skins**: dark = Space, Ember, Glade; light = Frost, Sakura, Moss.
