# dsh-desk-one

English | [简体中文](README.zh-CN.md)

**Desk One** — a personal office desk inside the DSH web UI: one sidebar entry, one panel, and one shared object model behind every tab. S0 ships the skeleton and the notes wall — a sticky wall you fill with "＋", drag around, resize and write on directly.

## What it is

* One left-sidebar entry named **Desk One**; functions live in tabs inside the panel instead of scattering across the UI.
* **Overview** is the main tab in the long run, but its content is not designed yet — it stays intentionally blank in this release.
* **Notes** is the first shipped feature: a free-form sticky wall, not an input form.

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
* The small **trash icon** on a sticky drops it into the trash without deleting it; the trash button next to **＋** opens the trash view, where a note can be restored or deleted permanently. The wall holds at most **100** notes and the trash at most **200**; the trash view shows the total and renders 20 rows at a time with **Load more**. No badge sits on the trash button — only genuinely unread things deserve that attention.
* **Smash!** under the two buttons moves every sticky on the wall into the trash after a two-step confirmation; the notes animate away. It is blocked when the trash cannot hold them all.

## Data and privacy

* Notes live in a DSH storage domain (`desk_one`) managed by the official storage service; nothing leaves the machine.
* The panel talks to the plugin's own host routes under `/api/desk-one`; the client never touches storage directly.
* Agent tools (`desk_note_*`) read and write the same notes, so the model and the wall always see one dataset.

## Known limitations

* S0 implements notes only; tasks, boards, focus sessions and calendars are planned in the repository spec.
* Notes are not synced to any external service yet; Outlook and WeCom calendar sync arrives in a later step.
* Notes created by agent tools get an automatic wall position until you drag them yourself.
* Saved positions are re-clamped on screen while the window is small, and return to their saved spots once there is room again.
* Overview stays blank until its content and linkage rules are designed.

## Development

* Plugin-level check: `npm run verify` inside this directory (typecheck, build, tests, pack check).
* Repository-level check: `pnpm run verify` at the repository root.
