# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.2-rc.1 (2026-09-04)

- Version-line alignment with official dsh 0.1.2-rc.1 (stability line).
- Parent-child tree panel: archived sessions show their subagent children nested beneath the parent (orange child count), and operations act on the parent with its children.
- Stray-session section: sessions that reference a missing parent (blank/orphan tags) are listed for archiving or deletion.
- Trash: restore or permanently delete entries individually or in bulk, with old-format entries (no sidecar) recognized.
- Sessions released mid-use unlock in the panel immediately (live-status refresh), and moves roll back cleanly if the sidecar write fails.
- Startup sweep: ghost archive ids and stale projection rows are cleaned automatically.
- Subagent labels read from the authoritative log tier, with in-memory fallbacks.
- The Archive button now aligns its width with Settings; any-session ids (externally injected) archive and restore correctly.

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

