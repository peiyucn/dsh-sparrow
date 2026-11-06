# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.1] - 2026-11-06

* First release: one **Desk One** entry in the left sidebar hosting a tabbed panel; **Overview** is reserved as the future hub and stays intentionally blank in this release.
* Notes wall: add a note with the floating **＋** button, write directly on the sticky, drag it by its body anywhere inside the visible wall (no scrollbars), click or drag a sticky to bring it to the front, resize it from the bottom-right corner, switch colors, archive it, or delete it on hover; the sticky is flat square paper with deeper Notion-toned colors and matching deep hue swatches (no gradients), and text, position, size, layer and archive state persist through the official DSH storage domain. The archive view above the wall restores or permanently deletes notes.
* Agent tools (`desk_note_*`) read and write the same notes, and the panel remembers the tab you were on when you come back.
