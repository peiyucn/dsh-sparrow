# Changelog

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- Renamed package from `@dsh-sparrow/dsh-archive-session` to `@dsh-sparrow/dsh-archive-manage` (route / locale namespace / sidecar filename and other internal identifiers aligned; the old name was never published, no migration cost)
- First published version, released to the `next` channel for owner validation before the stable `0.1.0`
- Sidebar footer "Archive" entry with a panel split into two sections: archived / backup
- Archived section: backup (moves the session off disk, reversible) or delete (irreversible, requires typing the full session title to confirm); sessions still held open in this dsh run are grouped and greyed out, actionable after the next dsh restart
- Backup section: restore or delete individually / in bulk; the backup location is shown at the top of the panel and copyable
- Backups write a sidecar (original path / workspace membership) used for restore; legacy directories without a sidecar are list/delete only
- Backup / delete also handles all subagent sessions of the parent session (moved into the backup together, restored together; orphan subagents are cleaned by the startup sweep)
- Removed from the @ list immediately after backup: updates the official workspace domain bookkeeping, invalidates projection-cache rows, and re-emits the `api-session/removed` event
- README positioning: the official archive flag does not filter @ candidates (verified through all three layers of the source); file-level backup is the only reversible way to take a session out of @
