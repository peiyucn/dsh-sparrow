# ✨ Desk One

**Package:** `@dsh-sparrow/dsh-desk-one`

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow?color=007ec6)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main&label=ci)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**Desk One (同桌) — one desk for you and harness.**

![Desk One hero](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-desk-one-hero.png)

[Desk One docs](plugins/dsh-desk-one/README.md) · [Plugin market](https://dsh.pyai.site/)

**Desk One (同桌)** is a shared desk for you and harness inside the DSH web UI: one sidebar entry, one panel, and one shared object model behind every tab. Annotations, notes, tasks, schedule and agent sessions live side by side; the schedule is a read-only mirror of the calendars you connect. The header's split **「✦」 Desk One｜Talk to Me** button drops a tab-aware prefilled prompt into the conversation, and the **…** menu holds **Make a wish** for turning an idea into a GitHub issue draft.

## What it is

* **One desk, not five pages.** Everything sits behind a single **Desk One** sidebar entry and switches tabs inside one panel; each tab can also be pinned as its own sidebar shortcut.
* **Annotations — AI writes, you annotate.** Link a registered DSH workspace as the notebook library, browse its Markdown / text files, and open a page in a dedicated annotation Session with exact source lines and a per-Session round baseline. No editor, no git dependency and no new-note form.
* **Notes — a wall, not a form.** A free-form sticky canvas with in-place editing, drag, resize, colour, layer order and a trash; **Smash!** clears the wall into the trash after a confirmation.
* **Tasks — a three-lane board.** To do / Doing / Done with colour tags, day-granular due dates, pointer dragging, one-level groups and a Done archive. Cards can link DSH sessions with **@**.
* **Schedule — a read-only mirror.** WeCom, iCloud and personal Outlook (Microsoft Graph) calendars plus public ICS subscriptions, shown as Start / Today / Upcoming plus month / week / list views.
* **Sessions — the shared catalog.** Active sessions grouped by workspace, plus archived / stray / trash sections with restore and permanent delete.

## Requirements

* Requires DSH 0.2.2-rc.3, the exact version line the other plugins in this repository pin.
* Node.js 24.9 or newer, matching the DSH host requirement.
* Notes, tasks and session management need no network or account setup. **Schedule aggregation** needs at least one source configured in the panel (WeCom CalDAV sync password, iCloud app-specific password, or personal Outlook via Microsoft Graph); public ICS subscriptions are added from the same settings page.

## Install

* Open **Plugins → Add plugin**, enter `@dsh-sparrow/dsh-desk-one`, and follow the install / enable flow.
* Or enable **Custom plugin indexes** under **Plugins → Experimental plugins**, open **Plugins → Discover**, add `https://dsh.pyai.site/market/index.json` as an index source, then search for **Desk One** and install it from the card.
* Restart DSH after installing; a browser refresh alone is not enough for the client bundle.

## With harness

Desk One is built for both sides of the desk. The same objects the panel writes are exposed to harness through a bundled skill and **19 agent tools**, so you can ask in the conversation and work on the same desk.

* **The `desk-one` skill** (on by default, also listed in `/`) teaches the agent when to use a note, a task, a group, a schedule query or a notebook page, and the `list → revision → update` flow. It also keeps the notebook boundary: `desk_page_list` only searches the workspace currently linked in the panel; it never writes files.
* **The 19 tools share the panel's storage and revision checks.** Note, task and group edits carry a revision check, so the agent and the panel cannot silently overwrite each other; a stale write fails with a conflict instead.

| Group | Tools | What harness can do |
| :--- | :--- | :--- |
| Notes (4) | `desk_note_add` · `desk_note_list` · `desk_note_update` · `desk_note_delete` | Create, list, edit (including pin / trash) and delete notes on the wall. |
| Tasks (5) | `desk_task_add` · `desk_task_list` · `desk_task_update` · `desk_task_complete` · `desk_task_archive` | Add, list, edit, complete and archive tasks; archive is Done-only. |
| Groups (6) | `desk_group_add` · `desk_group_list` · `desk_group_update` · `desk_group_move` · `desk_group_archive` · `desk_group_delete` | One-level task groups, including moving a whole group across lanes. |
| Schedule (3) | `desk_schedule_list` · `desk_schedule_sync` · `desk_schedule_connections` | Read the mirror, trigger a sync and inspect connection status; the calendar itself stays read-only. |
| Notebook (1) | `desk_page_list` | Read-only search of the linked notebook's pages. |

That is the **with harness** part: you can talk about the same desk you are looking at — ask it to add a card, tidy the wall, summarize the week or find the note you were annotating — and you are both working on the same objects.

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
* Repository-level check: `pnpm run verify` at the repository root.

## More from dsh-sparrow

Desk One is the page above. These three tools are separate installs; use the same plugin-manager flow and search for the package name if you want one.

| Plugin | Package | What it does |
| :--- | :--- | :--- |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.md) | `@dsh-sparrow/dsh-chat-fim` | DeepSeek FIM (Beta) suggestions in the chat composer; pause for a card, Tab to adopt. |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.md) | `@dsh-sparrow/dsh-codebuddy-credits` | Company CodeBuddy credits as a DSH LLM provider, with quota and per-turn credit display. |
| [dsh-theme-tone](plugins/dsh-theme-tone/README.md) | `@dsh-sparrow/dsh-theme-tone` | Tone skins above DSH's light / dark themes, plus conversation-area layout tuning. |

## Retired

Retired plugins are removed from the source tree and no longer maintained:

* `dsh-nav-pin` and `dsh-vision-bridge` — deleted 2026-10-27
* `dsh-file-manage` — deleted 2026-10-31
* `dsh-archive-manage` — retired 2026-11-15

## License

MIT
