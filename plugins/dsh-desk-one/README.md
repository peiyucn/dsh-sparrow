# dsh-desk-one

English | [简体中文](README.zh-CN.md)

**Desk One (同桌)** — a shared desk for you and harness inside the DSH web UI: one sidebar entry, one panel, and one shared object model behind every tab. Notes, tasks, schedule and agent sessions live side by side; the schedule aggregates WeCom / iCloud / personal Outlook calendars (read-only).

## What it is

* One left-sidebar entry named **Desk One**; functions live in tabs inside the panel instead of scattering across the UI. The panel chrome follows the official conversation header, and in-page action buttons reuse the official plugin-page button shape.
* **Schedule** leads the tab strip: a read-only calendar aggregating WeCom, iCloud, personal Outlook and public ICS subscriptions.
* **Notes** is the first shipped feature: a free-form sticky wall, not an input form.
* **Tasks** is the three-lane board (To do / Doing / Done) with colour tags, day-granular due dates, drag-to-move, groups and an archive.
* **Schedule** aggregates WeCom, iCloud and personal Outlook calendars into one read-only page: a Today / Upcoming top row, a month / week / calendar calendar below (month by default, Monday-first, week 8 hours per screen with scrolling), an event card anchored at the click, and a full calendar-source management page opened from the top-bar **Calendars** action (per-source cards; multiple provider-agnostic ICS subscriptions; Outlook Graph placeholder).
* **Sessions** is the shared agent-session catalog: active sessions grouped by workspace, plus archive management (unarchive, move to trash, restore, permanent delete, stray sessions) with typed-title confirmation for destructive actions. The panel header matches the conversation topbar: a compact 76px bar (solid official black/white by default; glass only when theme-tone is active) with the brand title plus a one-line intro and the active view actions, followed by official-style plain text tabs (2px underline on the active tab) and a trailing ellipsis launcher (official `More` button) that opens a blurred page menu; future tabs can move there instead of growing the strip. It is a fixed 76px overlay; every feature keeps a 76px content offset so the first paint starts below the glass while scrolling content passes underneath. The notes wall is full-bleed, and the trailing ellipsis opens a floating blurred page menu.

## Requirements

* Requires DSH 0.2.2-rc.1, the exact version line the other plugins in this repository pin.
* Node.js 24 or newer, matching the DSH host requirement.
* Notes, tasks and session management need no network or account setup. **Schedule aggregation** requires connecting at least one source in the panel (WeCom CalDAV sync password, iCloud app-specific password, or a personal Outlook published ICS link) and lets the host reach that service.

## Install

* `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`
* Restart dsh web after installing; a browser refresh alone is not enough for the client bundle.
* Then open the whale sidebar and pick **Desk One**.

## Use

* **Notebook** is a blank placeholder for now (its content has its own design track); the app opens on the schedule page instead of an empty page.
* Tap **Capture** in the title-row actions or double-click empty space on the wall: a fresh sticky appears at that spot, lands on top of the pile and takes the keyboard focus. The command row also hosts **Smash!** and the trash entry; the empty wall keeps its faint two-line hint.
* The wall is a fixed-width, vertically infinite canvas: drag a note to the bottom edge and the wall auto-scrolls; notes can live below the viewport and the wall scrolls vertically to them.
* Type straight onto the sticky; leaving it saves the text, and an emptied sticky is removed instead of kept as clutter.
* Drag a sticky by its body; a compact six-dot grip at the top-left marks the grab area. Whichever sticky you click or drag comes to the front, and that layer order is saved too.
* Drag the bottom-right corner of a sticky to change its size; position and size are saved per note.
* Hover a sticky to reveal its color dots and the small icon actions. The tab you were on is remembered when you come back to Desk One.
* The small **trash icon** on a sticky drops it into the trash without deleting it (with the same short fly-away animation as Smash); the trash button — separated from the wall actions by a hairline divider — opens the trash view, where a note can be restored or deleted permanently. The wall holds at most **100** notes and the trash at most **200**; the trash view shows the total and renders 10 rows at a time with **Load more**. No badge sits on the trash button — only genuinely unread things deserve that attention.
* **Smash!** is the red frosted-glass icon button next to **＋**: after a two-step confirmation it moves every sticky on the wall into the trash with a short fly-away animation. It is always visible and simply does nothing when the wall is empty; clicking anywhere else or pressing **Esc** cancels the confirmation. It is blocked when the trash cannot hold them all.
* Open **Tasks** for the fixed three-lane board. Add a card with a lane's **＋** or by double-clicking empty space in a lane; the card shows a wrapping title and description, a stacked colour swatch (current colour on top with palette neighbours peeking out; clicking opens a five-colour palette), and a calendar button for the day-granular deadline (icon only when unset, icon + date once set; click to change it). Click the title or description to edit it; the text is plain otherwise, so the **whole card is a drag surface**. Cards due within a day get an amber outline, overdue dates show in red, and only cards and groups in **Done** can be archived.
* Press anywhere on a card to drag it: a copy follows the pointer, lanes highlight, and dropping it on an invalid spot flies the card back. Drop a card into a lane to change status or onto another card to reorder; while dragging, the target lane and group light up and a blue insertion line shows exactly where it will land. Delete asks for a second click.
* The title-row actions switch between **manual order**, **creation time** and **due date**, and the **Done** lane can be collapsed. **＋ group** creates a real one-level group inside a lane: cards can be dragged in or out, the group can stay empty, its name can be edited in place, and the six-dot grip reorders groups. Its header uses two rows (name, then task count) so long names and the action icons fit a narrow lane. Ungrouped cards and group blocks share **one manual sequence**, so a group can be dropped between cards (and cards between groups). Dragging a group by its header moves the whole block just like a card — the header and its cards follow the pointer, dropping it on another lane moves its cards with it immediately (moving back is just as cheap), and a drop inside the same lane reorders groups. Deleting a group keeps its cards and makes them ungrouped. In the **Done** lane a group header also gets an archive button: archiving takes the whole group and its cards off the board, the archive view lists it as one row, restoring brings both back, and deleting an archived group removes its cards too. **Archived** lists archived tasks where they can be restored or deleted permanently.
* Open **Sessions** for the shared agent-session catalog: active, archived, stray and trash sections share one row layout and icon actions; active uses a soft success outline while the others stay neutral grey; parent/child sessions render as nested groups with actions on the parent only, and children always follow it. Active rows offer light archive only (no file changes); move-to-trash and delete live in the archived and trash sections. Archived rows can be unarchived, moved to trash or deleted forever (a parent takes its children with it); the trash supports expanding lineage, restore / restore all / permanent delete and shows a copyable path. Deleting a regular session requires typing its exact title, and blank strays plus bulk actions use their own two-step confirmation. Every section loads 30 rows at a time.
* Open **Schedule** for the aggregated calendar: the top row is split equally between **Today** and **Upcoming** — Today splits into today's events (left) and two clickable counts (notes / open tasks, right) with a hairline divider, plus **+ Note / + Task / + Notebook** white primary buttons (+ Notebook disabled for now); Upcoming has a 1–14 day slider showing the selected date range and its events. **Calendars** in the shared top bar opens the full source management page; the month / week / calendar view fills the rest (month by default, Monday-first, 5–6 rows as needed; week shows 8 hours and scrolls). Click an event for a card near the cursor and click elsewhere or press Esc to close. External events are read-only: copy them or jump back to the original client. The panel syncs on open and then every 15 minutes.
* Nothing scrolls sideways: when the panel gets too narrow the three lanes collapse into count-only columns (lane name plus per-group counts). When a lane's cards overflow vertically, its body shows a thin scrollbar and scrolls instead of squeezing the cards.
* Link DSH sessions to a card with **@** — a card can carry several sessions and one session can serve several cards. Each session chip carries its live state as colour (available sessions are green; archived/unavailable ones are neutral grey) and a slow orbiting green ring marks the ones where the agent is actually running (it stays still under reduced-motion). Click a chip to expand it in place, up to the card width (the card height may grow, and a running chip keeps its animated border around the expanded box): last run, model time, turns, steps and token usage appear inside, click elsewhere restores it, and the arrow opens the session. The **@** entry sits on its own row below the linked chips; its picker is a floating panel over the whole page (never clipped by the lane) and lists the same session set as the composer's `@` menu, including subagent sessions. Linking never overwrites the card's own title or description.

## Data and privacy

* Notes, tasks and the schedule mirror live in a DSH storage domain (`desk_one`) managed by the official storage service; the schedule is a read-only mirror and is never written back.
* Schedule credentials (sync password / published link) live only in the official credential store (`ctx.credentials`); records keep only a reference name, and nothing is written to logs, HTML or exports.
* The panel talks to the plugin's own host routes under `/api/desk-one` (sessions under `/api/desk-one/sessions/*`, schedule under `/api/desk-one/schedule/*`); the client never touches storage directly.
* Agent tools (`desk_note_*`, `desk_task_*`, `desk_group_*`, `desk_schedule_*`) read and write the same objects; the session index stores only FK metadata (never transcripts) for task/session edges, so the model and the UI always see one dataset. Session links store only opaque session ids next to your local data; their titles and running state are read from the host UI and never sent anywhere.

## Known limitations

* The schedule is a **read-only** aggregation: no local event creation, no write-back and no iCalendar subscription/publishing yet; the three sources must be configured by you on first use, and their protocol behaviour is owned by the official services.
* Schedule aggregation is bounded by those services: re-issuing the WeCom sync password invalidates the old one; iCloud app-specific passwords are all revoked when the Apple account password changes; Outlook published ICS refreshes on the receiving side (usually 3–24 hours).
* While the standalone archive plugin still exists it shares the same trash directory; after it retires, archive and trash management live only in Desk One.
* Focus sessions, search and richer task fields (priority, estimates, labels) are planned in the repository spec.
* Task drag is pointer-only; there is no keyboard reorder yet.
* Session links are display and navigation only for now: the board never advances a card when a session starts or ends.
* Notes created by agent tools get an automatic wall position until you drag them yourself.
* Saved positions are re-clamped on screen while the window is small, and return to their saved spots once there is room again.
* Notebook stays blank until its own design lands.

## Development

* Plugin-level check: `npm run verify` inside this directory (typecheck, build, tests, pack check).
* Repository-level check: `pnpm run verify` at the repository root.