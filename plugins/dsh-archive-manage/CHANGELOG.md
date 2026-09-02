# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

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

