# dsh-archive-manage

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Archived-session management — a DeepSeek Harness (DSH) Web plugin (part of the dsh-sparrow collection).

Complements DSH's built-in archive. DSH's archive marker only hides a session from the sidebar — the **@ mention list does not filter by the archive marker**, so archived sessions keep crowding @ candidates. This plugin adds an "Archive" entry at the top of the sidebar (beside the Plugins and Automations entries): it opens an archive page in the main area, where archived sessions can be **unarchived** (back to the session list), **moved to trash** (the session directory is moved out of persistence, reversible), or **deleted permanently** (irreversible), and trash entries can be **restored** anytime — moved or deleted sessions really leave the @ list.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage
```

Requires dsh 0.2.0-rc.2 — the exact official version line this release is built and verified against (newer lines, pre-releases in particular, are not covered) — and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-archive-manage` directly — that only downloads the package into a `node_modules` and does not register it in the DSH web profile. Install with the `dsh plugin` command above, then restart DSH.

## Usage

* **Entry**: The "Archive" icon at the top of the sidebar opens the archive page in the main area, with an Archive area and a Trash area
* **Getting back**: The archive page is a normal main-area page, not a dialog — it does not dim or block the interface. Return to a conversation the usual way: pick a session in the sidebar, or use New Session
* **Archive area**: Unarchive, move to trash, or delete permanently; permanent deletion requires typing the full session title as a strong confirmation
* **Subagent tree**: Subagent sessions are shown indented under their parent (read-only rows), collapsed by default — a parent row shows its subagent count and a ▸ toggle reveals the children; archive / unarchive / move to trash / delete / restore always treat a parent and its subagents as one unit
* **Stray sessions**: Sessions that belong to no workspace and are not archived — DSH has no way to clean them, and they keep crowding @ candidates. The page lists them separately with archive / move-to-trash / delete actions; blank sessions (0 turns) are badged and use a simplified confirmation
* **Held sessions**: Sessions opened during the current dsh run cannot have their files moved — they are grouped and greyed out in the archive area and become operable after the next dsh startup; unarchiving does not move files and works immediately. When a row is locked because one of its subagents is held (not the row itself), the row says so
* **Trash**: Restore or delete entries individually or in bulk; entries are shown as a parent/child tree (indented like the archive area, so multi-level subagents are not flattened) and are collapsed by default just like the archive area; sessions in the trash no longer appear in the @ list
* **Trash location**: The trash location is shown inside the Trash area; click to copy the full path

## Screenshots

![Archive page (archive & trash areas)](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-archive-manage.png)

## Trash Location & Restore

* Default trash folder: `$DSH_HOME/.sessions-trash/`; each entry folder contains a `dsh-archive-manage.json` recording its original location and workspace ownership, which restore uses to move it back
* That record also lists the parent's subagent sessions: restoring moves the whole family back together
* Folders without a record file are listed as "legacy": they can only be deleted permanently, not restored

## Uninstall & Residue

Uninstalling does **not** restore anything automatically: once the plugin is removed from DSH, its code is no longer loaded, so there is no moment for it to run — an inherent constraint of how DSH plugins work. Decide the fate of your data before uninstalling:

* **Sessions in the trash**: their folders and record files stay in the trash; reinstalling the plugin lets you restore or delete them again
* **Permanently deleted sessions**: irreversible, whether or not you uninstall
* **Unarchived sessions**: files were never moved — they stay in the normal session list, no residue

* Before uninstalling: settle the trash in one step ("Restore all" or "Delete all permanently"), then uninstall (the page shows a reminder while the trash is not empty)
* Already uninstalled? Reinstall the plugin to keep managing the trash (as long as record files exist, restore works)
**Changelog**: [CHANGELOG.md](https://github.com/peiyucn/dsh-sparrow/blob/main/plugins/dsh-archive-manage/CHANGELOG.md)
