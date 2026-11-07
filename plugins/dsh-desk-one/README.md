# dsh-desk-one

English | [简体中文](README.zh-CN.md)

**Desk One** — a personal office desk inside the DSH web UI: one sidebar entry, one panel, and one shared object model behind every tab. S0 ships the skeleton and the notes wall — a sticky wall you fill with "＋", drag around, resize and write on directly.

## What it is

* One left-sidebar entry named **Desk One**; functions live in tabs inside the panel instead of scattering across the UI.
* **Overview** is the main tab in the long run, but its content is not designed yet — it stays intentionally blank in this release.
* **Notes** is the first shipped feature: a free-form sticky wall, not an input form.
* **Tasks** is the second shipped feature: a three-lane board (To do / Doing / Done) with colour tags, day-granular due dates, drag-to-move and an archive.

## Requirements

* Requires DSH 0.2.2-rc.1, the exact version line the other plugins in this repository pin.
* Node.js 24 or newer, matching the DSH host requirement.
* No network access, no extra credentials, no account setup.

## Install

* `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`
* Restart dsh web after installing; a browser refresh alone is not enough for the client bundle.
* Then open the whale sidebar and pick **Desk One**.

## Use

* **Overview** is a blank placeholder for now; the app opens on the notes wall instead of an empty page.
* Tap the floating **＋** or double-click empty space on the wall: a fresh sticky appears at that spot, lands on top of the pile and takes the keyboard focus. The two floating actions sit at the bottom centre and use a frosted-glass surface with the same top-left lighting as the themed composer. The empty wall shows a faint two-line hint for this.
* The wall never scrolls: notes are always kept inside the visible area, even after you resize the window.
* Type straight onto the sticky; leaving it saves the text, and an emptied sticky is removed instead of kept as clutter.
* Drag a sticky by its body; a compact six-dot grip at the top-left marks the grab area. Whichever sticky you click or drag comes to the front, and that layer order is saved too.
* Drag the bottom-right corner of a sticky to change its size; position and size are saved per note.
* Hover a sticky to reveal its color dots and the small icon actions. The tab you were on is remembered when you come back to Desk One.
* The small **trash icon** on a sticky drops it into the trash without deleting it (with the same short fly-away animation as Smash); the trash button — separated from the wall actions by a hairline divider — opens the trash view, where a note can be restored or deleted permanently. The wall holds at most **100** notes and the trash at most **200**; the trash view shows the total and renders 10 rows at a time with **Load more**. No badge sits on the trash button — only genuinely unread things deserve that attention.
* **Smash!** is the red frosted-glass icon button next to **＋**: after a two-step confirmation it moves every sticky on the wall into the trash with a short fly-away animation. It is always visible and simply does nothing when the wall is empty; clicking anywhere else or pressing **Esc** cancels the confirmation. It is blocked when the trash cannot hold them all.
* Open **Tasks** for the fixed three-lane board. Add a card with a lane's **＋** or by double-clicking empty space in a lane; the card shows a wrapping title and description, a stacked colour swatch (current colour on top with palette neighbours peeking out; clicking opens a five-colour palette), and a calendar button for the day-granular deadline (icon only when unset, icon + date once set; click to change it). Click the title or description to edit it; the text is plain otherwise, so the **whole card is a drag surface**. Cards due within a day get an amber outline, overdue dates show in red, and only cards and groups in **Done** can be archived.
* Press anywhere on a card to drag it: a copy follows the pointer, lanes highlight, and dropping it on an invalid spot flies the card back. Drop a card into a lane to change status or onto another card to reorder; while dragging, the target lane and group light up and a blue insertion line shows exactly where it will land. Delete asks for a second click.
* The toolbar switches between **manual order**, **creation time** and **due date**, and the **Done** lane can be collapsed. **＋ group** creates a real one-level group inside a lane: cards can be dragged in or out, the group can stay empty, its name can be edited in place, and the six-dot grip reorders groups. Its header uses two rows (name, then task count) so long names and the action icons fit a narrow lane. Ungrouped cards and group blocks share **one manual sequence**, so a group can be dropped between cards (and cards between groups). Dragging a group by its header moves the whole block just like a card — the header and its cards follow the pointer, dropping it on another lane moves its cards with it immediately (moving back is just as cheap), and a drop inside the same lane reorders groups. Deleting a group keeps its cards and makes them ungrouped. In the **Done** lane a group header also gets an archive button: archiving takes the whole group and its cards off the board, the archive view lists it as one row, restoring brings both back, and deleting an archived group removes its cards too. **Archive** lists archived tasks where they can be restored or deleted permanently.
* Nothing scrolls sideways: when the panel gets too narrow the three lanes collapse into count-only columns (lane name plus per-group counts). When a lane's cards overflow vertically, its body shows a thin scrollbar and scrolls instead of squeezing the cards.
* Link DSH sessions to a card with **@** — a card can carry several sessions and one session can serve several cards. Each session chip carries its live state as tint + border (green while the agent is running, neutral while idle, dashed and muted when archived or unavailable); click a chip to open that session, or remove it from the card. The **@** entry sits on its own row below the linked chips; its picker is a floating panel over the whole page (never clipped by the lane) and lists the same session set as the composer's `@` menu, including subagent sessions. Linking never overwrites the card's own title or description.

## Data and privacy

* Notes live in a DSH storage domain (`desk_one`) managed by the official storage service; nothing leaves the machine.
* The panel talks to the plugin's own host routes under `/api/desk-one`; the client never touches storage directly.
* Agent tools (`desk_note_*`, `desk_task_*`, `desk_group_*`) read and write the same notes, tasks and groups, so the model and the UI always see one dataset. Session links store only opaque session ids next to your local data; their titles and running state are read from the host UI and never sent anywhere.

## Known limitations

* S1 ships notes and the task board; focus sessions, calendars and richer task fields (priority, estimates, labels) are planned in the repository spec.
* Task drag is pointer-only; there is no keyboard reorder yet.
* Session links are display and navigation only for now: the board never advances a card when a session starts or ends.
* Notes are not synced to any external service yet; Outlook and WeCom calendar sync arrives in a later step.
* Notes created by agent tools get an automatic wall position until you drag them yourself.
* Saved positions are re-clamped on screen while the window is small, and return to their saved spots once there is room again.
* Overview stays blank until its content and linkage rules are designed.

## Development

* Plugin-level check: `npm run verify` inside this directory (typecheck, build, tests, pack check).
* Repository-level check: `pnpm run verify` at the repository root.
