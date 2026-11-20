# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.5] - 2026-11-19

- Task cards now start with a one-line description that expands on click; the whole card can collapse to a compact row showing title, color, due date and linked-session count. Both states are remembered across reloads.
- When any linked session is running, the whole card shows a running ring in the card's own five-color accent; archived rows get the same cue, and reduced-motion users see a static ring.
- New-conversation task capture now has a short always-on system prompt: it asks once when the first message looks like trackable work, checks whether this conversation is already linked, and offers to link an existing unlinked task instead of creating a duplicate. It never creates or links silently.
- `desk_task_list` can filter by the current conversation, and `desk_task_update` can link the current conversation to an existing task or detach sessions by id (`unlink_session_ids`) / detach the current conversation (`unlink_current_session`).
- Bundled earlier unreleased work: archive refresh and two-step confirmations, two-step session deletion, session list pagination/sorting/time display, and the unified five-color palette for notes and tasks.
- Adapted to official dsh 0.2.2-rc.5 (web and desktop); the official web-search default change does not affect this plugin.

## [0.2.2-rc.3] - 2026-11-15

* **First release — Desk One is live.** One desk for annotations, notes, tasks, a read-only schedule and session management. See the [README](README.md) for the feature tour, install steps and known limitations.
