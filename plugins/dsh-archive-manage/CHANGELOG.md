# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

## 0.2.0-rc.2 (2026-10-08)

- Now adapted to official dsh 0.2.0-rc.2 (web and desktop).
- The Archive entry moved to the top of the sidebar, beside Plugins and Automations, and now opens as a page instead of a dialog.

## 0.1.5-rc.2.4 (2026-09-21)

- Fixed the sub-session connector lines in the session tree.

## 0.1.5-rc.2.3 (2026-09-13)

- Subagent trees in the archive area and the trash are collapsed by default; a parent row shows its subagent count.
- When a parent session is locked because one of its subagents is still in use by dsh, the row says so.

## 0.1.5-rc.2.2 (2026-09-12)

- Moving to trash or deleting a session now takes its whole subagent tree, however deep; nothing is left behind to clean up.
- Trash entries now expand as a parent/child tree like the archive area; entries moved by earlier versions stay flat.
- Archiving or unarchiving a parent session now updates its whole subagent tree at once.
- Restoring a session no longer leaves an extra file inside the session folder.
- A session folder already missing from disk no longer fails the action; the rest still moves and deletion goes through.

## 0.1.5-rc.2.1 (2026-09-11)

- Permanently deleting a session now clears the archived mark only from the subagents that were really deleted, so a failed one can be retried.

## 0.1.5-rc.2 (2026-09-10)

- Version-line alignment with official dsh 0.1.5-rc.2.
- Moving a session to trash and permanent deletion work again on dsh 0.1.5.
- The archive panel's loading animation now matches the rest of the interface.
- Moving to trash, permanent deletion, unarchiving and deleting trash entries remove the entry right away instead of reloading the whole list.

## 0.1.2-rc.1.1 (2026-09-09)

- If dsh is upgraded to a version this plugin does not support yet, the plugin disables itself; dsh and other plugins are unaffected.
- The archive panel opens faster on sessions with subagents.
- A newly created child session no longer briefly shows the parent's label.
- The panel no longer flickers after an action; the list and its buttons update in place.
- Sessions this plugin cannot safely handle are no longer moved or deleted; the action is refused instead.

## 0.1.2-rc.1 (2026-09-05)

- Version-line alignment with official dsh 0.1.2-rc.1.
- Archived sessions now show as a parent/child tree; a parent row carries its subagent count.
- Sessions whose parent is missing are listed separately with a badge, so they can be archived or deleted.
- Trash entries can be restored or deleted one by one or all at once, including entries from earlier versions.
- The trash location now appears inside the Trash area instead of at the top of the panel.
- Sessions released while the panel is open unlock right away, and a failed move rolls back.
- Entries for sessions that no longer exist are cleaned up automatically.
- Subagent labels now show correctly for sessions that are not open.
- The Archive button is now the same width as Settings, and every session id archives and restores correctly.
- Large archives open fast, and the list is paginated at 100 rows per page with a Load more button.
- A 🐦 dsh-sparrow brand line closes the panel.

## 0.1.1-alpha.1 (2026-09-02 · pre-release)

- Works with dsh versions released after 0.1.2-alpha.5.

## 0.1.0 (2026-09-02)

- Promoted 0.1.0 (identical to 0.1.0-alpha.3).

## 0.1.0-alpha.3 (2026-09-02 · pre-release)

- No user-perceivable change from the previous release.

## 0.1.0-alpha.2 (2026-09-01 · pre-release)

- Full-page loading, with a retry button on the error banner.

## 0.1.0-alpha.1 (2026-09-01 · pre-release)

- First published version.
- An "Archive" entry in the sidebar footer, opening a panel with an archive area and a backup area.
- Archive area: back up a session (moves it off disk, reversible) or delete it permanently (needs the full session title to confirm); sessions in use are greyed out until restart.
- Backup area: restore or delete entries one by one or all at once, with the backup location shown and copyable.
- Backups remember where each session came from so they can be restored; backup folders from much older versions can only be listed or deleted.
- Backing up or deleting a session also handles all of its subagent sessions, and restoring brings the whole family back.
- Backed-up sessions leave the @ list immediately.
- DSH's archive marker does not filter the @ candidate list; backing a session up is the reversible way to remove it from @.
