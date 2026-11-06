# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.1] - 2026-11-06

* First release: one **Desk One** entry in the left sidebar hosting a tabbed panel; **Overview** is reserved as the future hub and stays intentionally blank in this release.
* Notes wall: notes sit on a visible rounded board instead of floating in the void; add one with the floating **＋** or by double-clicking the board's empty space — the new sticky lands where you clicked, on top of the pile, and takes focus. Write directly on the sticky, drag it by its body anywhere inside the visible board (no scrollbars), click or drag a sticky to bring it to the front, resize it from the bottom-right corner, switch colors or drop it into the trash with the trash icon on hover; the sticky is flat square paper with deeper Notion-toned colors and matching deep hue swatches (no gradients), and text, position, size, layer and trash state persist through the official DSH storage domain. The trash, grouped with the **＋** button, restores or permanently deletes notes, and emptying it is an explicit two-step user action (never automatic).
* Agent tools (`desk_note_*`) read and write the same notes, and the panel remembers the tab you were on when you come back.
