# Desk One (同桌)

**dsh-sparrow** is a collection of DeepSeek Harness (DSH) plugins; **Desk One** is the core plugin.

English | [简体中文](README.zh-CN.md)

**One desk for you and harness.**

![Desk One hero](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-desk-one-hero.png)

## What it is

* Annotations: Link a registered DSH workspace as the notebook library, browse its Markdown / text files, and open a page in the current conversation for annotation (or explicitly in a new Session) — exact source lines, a per-Session round baseline. No editor, no git dependency and no new-note form.
* Notes: A free-form sticky canvas with in-place editing, drag, resize, colour, layer order and a trash; **Smash!** clears the wall into the trash after a confirmation.
* Tasks: To do / Doing / Done lanes with colour tags, day-granular due dates, pointer dragging, one-level groups and a Done archive. Cards can link DSH sessions with **@**.
* Schedule: WeCom, iCloud and personal Outlook (Microsoft Graph) calendars plus public ICS subscriptions, shown as Start / Today / Upcoming plus month / week / list views.
* Sessions: Active sessions grouped by workspace, plus archived / stray / trash sections with restore and permanent delete.

## Requirements

* Requires DSH >=0.2.2-rc.3 <0.2.3, the 0.2.2 line; other plugins in this repository share the same range. This release is built and verified against 0.2.2-rc.5.
* Node.js 24.9 or newer, matching the DSH host requirement.
* Notes, tasks and session management need no network or account setup. **Schedule aggregation** needs at least one source configured in the panel (WeCom CalDAV sync password, iCloud app-specific password, or personal Outlook via Microsoft Graph); public ICS subscriptions are added from the same settings page.

## Install

* Open **Plugins → Add plugin**, enter `@dsh-sparrow/dsh-desk-one`, and follow the install / enable flow.
* Or enable **Custom plugin indexes** under **Plugins → Experimental plugins**, open **Plugins → Discover**, add `https://dsh.pyai.site/market/index.json` as an index source, then search for **Desk One** and install it from the card.
* Restart DSH after installing; a browser refresh alone is not enough for the client bundle.

## With harness

Desk One is built for you and harness together. The same objects the panel writes are exposed to harness through a bundled skill and **19 agent tools**: ask in the conversation and harness edits the same objects the panel shows.

* **The `desk-one` skill** (on by default, also listed in `/`) teaches the agent when to use a note, a task, a group, a schedule query or a notebook page, and the `list → revision → update` flow. It also keeps the notebook boundary: `desk_page_list` only searches the workspace currently linked in the panel; it never writes files.
* **The 19 tools share the panel's storage and revision checks.** Note, task and group edits carry a revision check, so the agent and the panel cannot silently overwrite each other; a stale write fails with a conflict instead.

| Group | Tools | What harness can do |
| :--- | :--- | :--- |
| Notes (4) | `desk_note_add` · `desk_note_list` · `desk_note_update` · `desk_note_delete` | Create, list, edit (including pin / trash) and delete notes on the wall. |
| Tasks (5) | `desk_task_add` · `desk_task_list` · `desk_task_update` · `desk_task_complete` · `desk_task_archive` | Add, list, edit, complete and archive tasks; archive is Done-only. |
| Groups (6) | `desk_group_add` · `desk_group_list` · `desk_group_update` · `desk_group_move` · `desk_group_archive` · `desk_group_delete` | One-level task groups, including moving a whole group across lanes. |
| Schedule (3) | `desk_schedule_list` · `desk_schedule_sync` · `desk_schedule_connections` | Read the mirror, trigger a sync and inspect connection status; the calendar itself stays read-only. |
| Notebook (1) | `desk_page_list` | Read-only search of the linked notebook's pages. |

That is the **with harness** part: **you say it, harness does it.** Adding a card, tidying the wall, summarizing the week or finding the note you were annotating all start in the conversation.

## Data and privacy

* Notes, tasks, the schedule mirror, annotation records and session-index rows live in the profile-level `desk_one` DSH storage domain. The schedule is a read-only mirror and is never written back.
* Schedule credentials (sync password / OAuth refresh token / subscription link) live only in the official credential store (`ctx.credentials`); records keep only a reference name, and nothing is written to logs, HTML or exports.
* The panel talks to the plugin's own host routes under `/api/desk-one` (sessions under `/api/desk-one/sessions/*`, schedule under `/api/desk-one/schedule/*`, annotations under `/api/desk-one/notebook/*`); the client never touches storage directly.
* The session index stores only FK metadata, never transcripts; session links store only opaque ids.

## Known limitations

* The schedule is a **read-only** aggregation: no local event creation, no write-back, and no publishing / exporting your own calendar as an iCalendar feed. Subscribing to public ICS links is supported.
* Schedule sources are owned by their services: re-issuing the WeCom sync password invalidates the old one, iCloud app-specific passwords stop working when the Apple password changes, and Outlook needs re-authorisation when its token expires.
* Task drag is pointer-only; there is no keyboard reorder.
* Session links are display and navigation only: the board never advances a card when a session starts or ends.
* Notes created by agent tools get an automatic wall position until you drag them yourself; saved positions are re-clamped while the window is small and return when there is room.
* Annotations have no editor and no new-note form; the page is for browsing and line-level annotation only.

## Development

* Plugin-level check: `npm run verify` inside this directory (typecheck, build, tests, pack check).
* Repository-level check: `npm run verify` at the repository root.
