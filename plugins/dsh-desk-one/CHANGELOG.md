# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.1] - 2026-11-06

* First release: one **Desk One** entry in the left sidebar hosting a tabbed panel; **Overview** is reserved as the future hub and stays intentionally blank in this release.
* Notes wall: add a note with the floating **＋** button, write directly on the sticky, drag it by its body anywhere inside the visible wall (no scrollbars), click or drag a sticky to bring it to the front, resize it from the bottom-right corner, switch colors or drop it into the trash with the small **trash icon** on hover; the sticky is flat square paper with deeper Notion-toned colors and matching deep hue swatches (no gradients), and text, position, size, layer and trash state persist through the official DSH storage domain. The trash, grouped with the **＋** button, restores or permanently deletes notes, and emptying it is an explicit two-step user action (never automatic).
* Agent tools (`desk_note_*`) read and write the same notes, and the panel remembers the tab you were on when you come back.
