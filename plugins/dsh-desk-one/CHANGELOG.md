# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.5.1] - 2026-11-22

- Task capture now treats project and code work as task work: when a request has a concrete outcome — files, code, config, data or documents changed, a deliverable, verification, or follow-up — Desk One asks once whether to create a task and link the conversation. It checks the first real work request and can ask once later if the work turns into a multi-step task; it still never creates or links silently.
- The assistant can now permanently delete a task card when you explicitly ask. Only the card is removed; linked conversations and groups are untouched.

## [0.2.2-rc.5] - 2026-11-22

- Task cards now start with a one-line description that expands on click; the whole card can collapse to a compact row showing title, color, due date and linked-session count. Both states are remembered across reloads.
- When any linked session is running, the whole task card shows a running ring in the card's own color, including archived rows and session chips. The ring always rotates as a status cue.
- New-conversation task capture now asks once when the first message looks like trackable work, checks whether this conversation is already linked, and offers to link an existing unlinked task instead of creating a duplicate. It never creates or links silently.
- Tasks can be filtered by the current conversation, linked to it, or detached from a session.
- Earlier unreleased improvements: archive refresh and two-step confirmations, session deletion confirmation, session list pagination/sorting/time display, and a unified color palette for notes and tasks.
- Annotations open in the current conversation by default; a secondary "new session" action creates a dedicated one. Opening the view no longer marks the conversation — the first saved annotation or an explicit new session does, and the session badge can be clicked to clear an accidental mark.
- The “Talk to Me” menu wraps each suggestion in double quotes, so the list reads like spoken prompts.
- The header and every feature page now share a consistent content width, keeping page content and the “Pin to sidebar” control aligned; the Annotations page uses the full content width.
- The annotation composer closes only with Cancel: outside clicks and Escape no longer dismiss it, even when empty. With text, Cancel asks for a second click; an empty composer closes immediately. Opening another annotation while one is open no longer replaces it.
- Microsoft Outlook sign-in now returns to Desk One correctly on desktop instead of leaving the window on a failed callback; the success page no longer sends the window back to the sign-in page.
- Adapted to official dsh 0.2.2-rc.5 (web and desktop); the official web-search default change does not affect this plugin.

## [0.2.2-rc.3] - 2026-11-15

* **First release — Desk One is live.** One desk for annotations, notes, tasks, a read-only schedule and session management. See the [README](README.md) for the feature tour, install steps and known limitations.
