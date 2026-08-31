# dsh-archive-session

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

Archived-session management — a DeepSeek Harness (DSH) Web plugin (part of the dsh-sparrow collection).

Complements the built-in archive. DSH's archive marker only hides a session from the sidebar — the **@ mention list does not filter by the archive marker**, so archived sessions keep crowding @ candidates. This plugin adds an "Archive" entry at the bottom of the sidebar to truly **back up** archived sessions (the session directory is moved out of persistence, reversible) or **delete** them (irreversible), and **restore** backups anytime — backed-up or deleted sessions really leave the @ list.

## Install

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-archive-session
```

Requires dsh ≥ 0.1.1-rc.2 and a working `pnpm` (`dsh plugin` forwards installation to pnpm).

> Do **not** run `npm install @dsh-sparrow/dsh-archive-session` directly — that only downloads the package into a `node_modules` and does not register it in the DSH web profile. Install with the `dsh plugin` command above, then restart DSH.

## Usage

* **Entry**: The "Archive" button at the bottom of the sidebar opens a panel with an Archive area and a Backups area
* **Archive area**: Back up or delete archived sessions; deletion requires typing the full session title as a strong confirmation
* **Held sessions**: Sessions opened during the current dsh run cannot have their files moved — they are grouped and greyed out in the archive area and become operable after the next dsh startup
* **Backups area**: Restore or delete backups individually or in bulk; backed-up sessions no longer appear in the @ list
* **Backup location**: The backup location is shown at the top of the panel; click to copy the full path

## Screenshots

![Archive panel (archive & backups areas)](docs/images/panel.png)

## Backup Location & Restore

* Default backup folder: `$DSH_HOME/sessions-archived-backup/`; each backup folder contains a `dsh-archive-session.json` recording its original location and workspace ownership, which restore uses to move it back
* Folders without a sidecar file are listed as "legacy": they can only be deleted, not restored

## Uninstall & Residue

* **Uninstalling does not restore backups**: the backup folder and the session folders inside it stay. Restore all backups before uninstalling; if already uninstalled, reinstall the plugin to restore them.
