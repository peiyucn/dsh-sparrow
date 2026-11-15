# 🐦dsh-sparrow

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

## Use

### Annotations

* In the panel's top bar, pick a registered workspace. The unlinked home lists registered workspaces directly; there is no folder picker or unlink option, and no new-note creation.
* The page top row is the official search field (left, filling the remaining width) and a fixed 340px white **Browse workspace files, click ✦ to annotate** button (right). The four views, count and pager live in the list header; 20 compact rows per page.
* Opening a page starts or reuses that note's annotation Session: exact line numbers, MD / code view, an inline annotation composer, **Submit annotations** and **This round's changes** split buttons, and a baseline per Session. The official file preview header gets the same ghost ✦ button for any Markdown / text file inside a registered workspace.
* No editor and no git: annotations are made by the user in the UI, and the only agent-facing notebook tool is the read-only `desk_page_list` search.

### Notes wall

* Add a sticky with **Note** in the title-row actions or by double-clicking empty wall space; type in place and leave to save. An emptied sticky is removed.
* The wall is a fixed-width, vertically infinite canvas. Drag a sticky by its body, resize from the bottom-right corner, change colour, and bring it to the front; position, size and layer order are saved per note.
* The small trash icon sends a sticky to the trash; the trash view restores or permanently deletes it. The wall holds up to 100 notes, the trash up to 200, and the trash loads 10 rows at a time.
* **Smash!** moves every sticky to the trash after a two-step confirmation. Click elsewhere or press Esc to cancel; it is blocked when the trash cannot hold the whole wall.

### Task board

* Three fixed lanes: To do / Doing / Done. Add a card with a lane's **＋** or by double-clicking empty space; set a colour and a day-granular due date. Only Done cards and groups can be archived.
* Drag a card anywhere to move or reorder it: a copy follows the pointer, lanes highlight, and a blue insertion line shows the exact drop point. An invalid drop flies the card back.
* One-level groups can be empty, renamed in place and reordered by their six-dot grip. Dragging a group header moves the whole block, including its cards; archiving a Done group archives its cards too.
* Switch the sort between manual order, creation time and due date. Use **@** on a card to link sessions; chips show live state and a preview, and linking never overwrites the card title or description.

### Schedule

* The top row is **Start** (three tall white actions: Annotation / Note / Task), **Today** and **Upcoming**; below it are month (default, Monday-first), week (ISO week number, 0–24 hour ruler) and list views.
* Click an event for a card near the cursor; external events stay read-only, with copy and jump-back actions. **Calendar settings** in the shared top bar manages sources, calendars and manual sync.
* The panel syncs on open and then every 15 minutes. On failure, the **Calendar settings** action gets a red badge and the failing source card shows the exact error; the calendar page stays clean.

### Sessions

* Active sessions are grouped by workspace; archived, stray and trash sections share one row layout. Parent and child sessions render as nested groups, with actions on the parent.
* Archive / unarchive uses the official API and never touches files; a session with running activity is refused, so stop generation first. Move to trash, restore and permanent delete live in the archived / trash sections; deleting a regular session requires typing its title, and a parent takes its children with it.
* Every row has copy-name and copy-session-id buttons with feedback on the button. Each section loads 30 rows at a time. If the host lacks the session services, the tab degrades instead of taking Desk One down.

### Talk to Me and Make a wish

* The split **「✦」 Desk One｜Talk to Me** button prefills a prompt for the current tab into the composer and focuses it; nothing is sent automatically. With no workspace, the official workspace notice applies.
* The **…** menu at the end of the tab strip has **Make a wish**: describe a feature and it prefills a prompt for a GitHub issue draft. You see the title and body first; it is never published automatically.

## Data and privacy

* Notes, tasks, the schedule mirror, annotation records and session-index rows live in the profile-level `desk_one` DSH storage domain. The schedule is a read-only mirror and is never written back.
* Schedule credentials (sync password / OAuth refresh token / subscription link) live only in the official credential store (`ctx.credentials`); records keep only a reference name, and nothing is written to logs, HTML or exports.
* The panel talks to the plugin's own host routes under `/api/desk-one` (sessions under `/api/desk-one/sessions/*`, schedule under `/api/desk-one/schedule/*`, annotations under `/api/desk-one/notebook/*`); the client never touches storage directly.
* Agent tools (`desk_note_*`, `desk_task_*`, `desk_group_*`, `desk_schedule_*`, `desk_page_list`) read and write the same objects; a bundled `desk-one` operating guide skill (on by default, also in `/`) covers object choice, the list → revision → update flow and the current-workspace boundary. The session index stores only FK metadata, never transcripts; session links store only opaque ids.

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
