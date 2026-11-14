# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.3] - 2026-11-14

* **First release — Desk One**: one **Desk One** entry in the left sidebar hosting a tabbed panel (order: Schedule / Notebook / Notes / Tasks / Sessions); each tab can be pinned as its own sidebar shortcut (live add / remove, kept across restarts), and the panel remembers the last tab you were on. The panel chrome follows the official conversation header; the glass material is used only when theme-tone is active.

* **Notebook**: link a DSH workspace as the note library, browse and search indexed Markdown / text pages with four views (All / Annotation drafts / Annotation records / Missing metadata), and create a note either as an empty file or through **Let AI draft** with an optional note / writing skill (off by default, only user-invocable note skills are listed). The official file browser and markdown preview are left untouched.

* **Review**: a dedicated review tab with exact source line numbers; select lines to annotate inline (edit / delete drafts), **Submit annotations** inserts one numbered message into the review Session's composer without sending, and **This round's changes** shows the diff against a per-review-Session baseline and highlights the changed lines in place; submitted annotation records can be read back and deleted. Reopening a note returns to that note's own openable review Session (never your current conversation), and review Sessions are marked in the sidebar with the official blue glyph (the **Review view** entry in the official file browser header shares that colour) and show an in-composer guidance hint.

* **Notes wall**: a free-form sticky canvas — add a sticky with **Capture** or by double-clicking, edit in place, drag / resize / change colour / layer, with each sticky showing its creation date. The wall is capped at 100 notes and the trash at 200; the trash supports restore and permanent delete, and **Smash!** clears the whole wall into the trash after a two-step confirmation.

* **Tasks**: a fixed three-lane board (To do / Doing / Done) with colour tags, day-granular due dates, pointer dragging with a precise insertion line, three sort views (manual / created / due), one-level groups that can be dragged, archived and restored as a unit, and a **Done** archive. Task cards link DSH sessions with **@** and show each session chip's live state and a quick preview.

* **Schedule**: a read-only page aggregating WeCom CalDAV, iCloud CalDAV, personal Outlook through Microsoft Graph sign-in, and any public ICS subscriptions. It has a Start / Today / Upcoming top row, month / week / calendar views, an event card anchored at the click, and a per-source calendar settings page with manual sync, per-calendar visibility and colour. The panel syncs on open and then every 15 minutes; sync failures are surfaced as a badge on the **Calendar settings** action and detailed in the failing source card.

* **Schedule sync is more robust**: expired Outlook login flows are cleaned up, an invalid callback address is reported clearly, and the sync report now counts only the events actually mirrored.

* **Sessions**: the shared agent-session catalog — active sessions grouped by workspace, plus archived / stray / trash sections with unarchive, move-to-trash, restore and permanent delete (deleting a regular session requires typing its exact title), parent/child nesting, and copy-name / copy-session-id buttons on every row.

* **Agent surface**: 19 `desk_*` tools (notes, tasks, task groups, schedule and the read-only page search) read and write the same data as the UI, and a bundled `desk-one` operating guide skill (on by default, also available via `/`) explains which object to use and the list → revision → update flow.

* **Dates and narrow panes**: dates and times follow the UI language (for example a Chinese UI shows "11月13日"), and narrow panels reflow the schedule top cards, the notebook toolbar and the task lanes instead of overflowing sideways.

* **Data and privacy**: notes, tasks, schedule mirror and notebook review records live in the profile-level `desk_one` DSH storage domain; schedule credentials (sync password / OAuth refresh token / subscription link) live only in the official credential store, and nothing is written to logs, HTML or exports.

* **Archive uses the official path**: archiving or unarchiving a session from Desk One now goes through the official archive API — an active session is refused with a "stop it first" message, archived sessions drop their pin, and the official follow-up (for example the rc.2+ worktree reclamation) runs exactly as it does from the official session menu.

* **Notebook filter tabs**: the four view tabs stay on one line in the English UI (shorter labels), so they no longer wrap into two lines on a normal-width panel.

* **Pinned sidebar shortcuts**: clicking a pinned shortcut (for example Sessions) now always returns to that tab, even after switching tabs inside its panel.

* **Sessions tab icon**: the Sessions tab and its pinned sidebar entry use the official session-list glyph (a speech bubble with two lines) instead of the official New Session icon, so the two no longer look alike.

* **Known limits**: the schedule is read-only (no local event creation, no write-back, and no publishing your own calendar as an iCalendar feed; subscribing to external ICS links is supported). Focus sessions, cross-object search, data export / import and richer task fields are planned in the repository spec.
