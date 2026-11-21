# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.5] - 2026-11-22

- Task cards now start with a one-line description that expands on click; the whole card can collapse to a compact row showing title, color, due date and linked-session count. Both states are remembered across reloads.
- When any linked session is running, the whole card shows a running ring in the card's own five-color accent; archived rows and session chips get the same cue. The ring always rotates, even when the system requests reduced motion: running is a status cue (owner decision).
- New-conversation task capture now has a short always-on system prompt: it asks once when the first message looks like trackable work, checks whether this conversation is already linked, and offers to link an existing unlinked task instead of creating a duplicate. It never creates or links silently.
- `desk_task_list` can filter by the current conversation, and `desk_task_update` can link the current conversation to an existing task or detach sessions by id (`unlink_session_ids`) / detach the current conversation (`unlink_current_session`).
- Bundled earlier unreleased work: archive refresh and two-step confirmations, two-step session deletion, session list pagination/sorting/time display, and the unified five-color palette for notes and tasks.
- Notebook review now opens in the current conversation by default; a secondary "review in a new session" action creates a dedicated one. Opening the tab alone no longer marks the conversation — the first saved annotation (or an explicit new session) does, and the session-row badge can be clicked to clear a mistaken mark.
- The “Talk to Me” menu now wraps each suggested phrase in typographic double quotes, so the list reads like spoken prompts.
- The header and the task, schedule, notebook, session and notes pages now share one content column at every width: centered 1100px on wide panels, a fixed 28px gutter on narrow panels. The “Pin to sidebar” shortcut stays fixed on that column's right edge instead of changing position per tab; the Annotations page no longer caps its body at the old 960px width.
- The annotation composer can only be closed with Cancel: outside clicks and Escape no longer dismiss it, even when empty. With text, Cancel first asks for a second click; an empty composer closes immediately. Opening another annotation while one is open no longer replaces it — cancel first.
- Microsoft Outlook browser sign-in now builds its OAuth callback from the host web server's real port; desktop windows whose location has no port previously redirected to port 80 and never returned. The success page also no longer navigates back to `/` after consent.
- Adapted to official dsh 0.2.2-rc.5 (web and desktop); the official web-search default change does not affect this plugin.

## [0.2.2-rc.3] - 2026-11-15

* **First release — Desk One is live.** One desk for annotations, notes, tasks, a read-only schedule and session management. See the [README](README.md) for the feature tour, install steps and known limitations.
