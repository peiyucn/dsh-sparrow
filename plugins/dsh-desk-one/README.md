# dsh-desk-one

English | [简体中文](README.zh-CN.md)

A personal desk inside the DSH web UI: one sidebar entry, one panel, and one shared object model behind every tab. S0 ships the skeleton and the notes wall — a sticky wall you fill with "＋", drag around and write on directly.

## What it is

* One left-sidebar entry named **Desk**; functions live in tabs inside the panel instead of scattering across the UI.
* **Today** is the main tab and the future aggregation hub for tasks and calendar events.
* **Notes** is the first shipped feature: a free-form sticky wall, not an input form.

## Requirements

* Requires DSH 0.2.2-rc.1, the exact version line the other plugins in this repository pin.
* Node.js 24 or newer, matching the DSH host requirement.
* No network access, no extra credentials, no account setup.

## Install

* `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`
* Restart dsh web after installing; a browser refresh alone is not enough for the client bundle.
* Then open the whale sidebar and pick **Desk**.

## Use

* In **Notes**, tap the floating **＋** at the bottom right; a fresh sticky appears and takes the keyboard focus.
* Type straight onto the sticky; leaving it saves the text, and an emptied sticky is removed instead of kept as clutter.
* Drag a sticky by its body to place it anywhere on the wall; positions are saved per note.
* Hover a sticky to reveal its color dots and the **×** delete button.
* Use the **Today** tab for the summary; it becomes the hub once tasks and calendars land.

## Data and privacy

* Notes live in a DSH storage domain (`desk_one`) managed by the official storage service; nothing leaves the machine.
* The panel talks to the plugin's own host routes under `/api/desk-one`; the client never touches storage directly.
* Agent tools (`desk_note_*`) read and write the same notes, so the model and the wall always see one dataset.

## Known limitations

* S0 implements notes only; tasks, boards, focus sessions and calendars are planned in the repository spec.
* Notes are not synced to any external service yet; Outlook and WeCom calendar sync arrives in a later step.
* Notes created by agent tools get an automatic wall position until you drag them yourself.

## Development

* Plugin-level check: `npm run verify` inside this directory (typecheck, build, tests, pack check).
* Repository-level check: `pnpm run verify` at the repository root.
