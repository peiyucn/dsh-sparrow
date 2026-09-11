# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.5-rc.2.2 (2026-09-12)

- Moving a session to trash or deleting it permanently now takes along **every** subagent in its tree: subagents that spawned their own subagents (grandchildren and deeper, any depth) are no longer left behind as separate entries you had to clean up one by one.
- Archiving or unarchiving a parent session now settles the archive state of its whole subagent tree in one go (deeper subagents previously caught up only on a later refresh or panel reopen).
- Restoring a session no longer leaves the plugin's bookkeeping file inside the session folder, where exported session logs used to carry it along.
- A session folder that is already missing from disk no longer fails hard: subagents are skipped while the rest moves as usual, permanent deletion treats it as already gone, and moving it to trash reports a clear message instead of a raw filesystem error.

## 0.1.5-rc.2.1 (2026-09-11)

- Permanently deleting a session now clears the archived mark only from the subagent sessions that were really deleted: a subagent whose deletion failed keeps its mark and stays operable in the panel, so the deletion can be retried instead of leaving an unaccounted-for entry behind.

## 0.1.5-rc.2 (2026-09-10)

- Version-line alignment with official dsh 0.1.5-rc.2.
- Moving a session to trash or deleting it permanently works again on dsh 0.1.5: the previous release refused both because it did not recognize the new session format.
- The panel's loading indicator now uses dsh's own dot-matrix chase animation, matching the rest of the UI.
- Entries disappear as soon as an action succeeds: moving a session to trash, deleting it, unarchiving it or deleting a trash entry no longer leaves the panel waiting for the whole list to reload.

## 0.1.2-rc.1.1 (2026-09-09)

- If dsh is upgraded to a version this plugin does not support yet, the plugin now disables itself instead of running against an unknown contract (dsh and other plugins are unaffected).
- The archive panel opens noticeably faster: subagent labels no longer re-read a session's whole log when the official projection cache has already settled them (previously every open re-folded the log for each subagent).
- Subagent labels are no longer taken from an inherited ancestor descriptor (a forked child briefly showed the parent's label before writing its own).
- The panel no longer flickers after an action: the list and its buttons stay as they are and update in place, instead of being replaced by a loading spinner or briefly greying out.
- Sessions stored in a format this plugin does not recognize are no longer moved or deleted: the action is refused instead of guessed at.

## 0.1.2-rc.1 (2026-09-05)

- Version-line alignment with official dsh 0.1.2-rc.1 (stability line).
- Parent-child tree panel: archived sessions show their subagent children nested beneath the parent (orange child count), and operations act on the parent with its children.
- Stray-session section: sessions that reference a missing parent (blank/orphan tags) are listed for archiving or deletion.
- Trash: restore or permanently delete entries individually or in bulk, with old-format entries (no sidecar) recognized.
- The trash location row now sits inside the Trash area (no longer a global row above the panel content).
- Sessions released mid-use unlock in the panel immediately (live-status refresh), and moves roll back cleanly if the sidecar write fails.
- Startup sweep: ghost archive ids and stale projection rows are cleaned automatically.
- Subagent labels read from the authoritative log tier, with in-memory fallbacks.
- The Archive button now aligns its width with Settings; any-session ids (externally injected) archive and restore correctly.
- Large archives open fast: session headers are cached in memory (invalidated on every change), titles come from the projection cache instead of re-reading each log, and lists are paginated (100 rows + Load more).
- A subtle 🐦 dsh-sparrow brand line closes the panel.

## 0.1.1-alpha.1 (2026-09-02 · pre-release)

- Compat with dsh master after the 0.1.2-alpha.5 publish: `sessionPersistence.list()` now returns snapshots on master (dual-shape mapping keeps older dsh versions working), and `locate` moved from the public contract to a backend-private method (startup capability check added, failing fast with a clear message).

## 0.1.0 (2026-09-02)

- Promoted 0.1.0 (identical to 0.1.0-alpha.3).

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- README screenshots now use absolute URLs and are no longer packed into the npm package (functionally identical to the previous release).

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Full-page loading with an error-banner retry button (removes the open flicker).

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First published version, released to the `next` channel for owner validation before the stable `0.1.0`
- Sidebar footer "Archive" entry with a panel split into two sections: archived / backup
- Archived section: backup (moves the session off disk, reversible) or delete (irreversible, requires typing the full session title to confirm); sessions still held open in this dsh run are grouped and greyed out, actionable after the next dsh restart
- Backup section: restore or delete individually / in bulk; the backup location is shown at the top of the panel and copyable
- Backups write a sidecar (original path / workspace membership) used for restore; legacy directories without a sidecar are list/delete only
- Backup / delete also handles all subagent sessions of the parent session (moved into the backup together, restored together; orphan subagents are cleaned by the startup sweep)
- Removed from the @ list immediately after backup: updates the official workspace domain bookkeeping, invalidates projection-cache rows, and re-emits the `api-session/removed` event
- README positioning: the official archive flag does not filter @ candidates (verified through all three layers of the source); file-level backup is the only reversible way to take a session out of @

