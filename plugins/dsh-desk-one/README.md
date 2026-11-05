# dsh-desk-one

English | [简体中文](README.zh-CN.md)

A personal desk inside the DSH web UI: one sidebar entry, one panel, and one shared object model behind every tab. S0 ships the skeleton and the notes wall; tasks, boards and calendars land in later versions on the same model.

## What it is

* One left-sidebar entry named **Desk**; the panel hosts tabs instead of scattering features across the UI.
* The **Today** tab is the hub: it is where notes, tasks and calendar events will be aggregated and linked.
* The **Notes** tab is the first shipped feature: create, edit, pin, color, search and delete notes.

## Requirements

* Requires DSH 0.2.2-rc.1, the exact version line the other plugins in this repository pin.
* Node.js 24 or newer, matching the DSH host requirement.
* No network access, no extra credentials, no account setup.

## Install

* `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`
* Restart dsh web after installing; a browser refresh alone is not enough for the client bundle.
* Then open the whale sidebar and pick **Desk**.

## Use

* Switch between **Today** and **Notes** with the tab bar at the top of the panel.
* In **Notes**, type a title or a body and press **Save**; an empty title falls back to the first body line.
* Hover a note card to reveal **Pin**, **Edit** and **Delete**; **Delete** asks for a second click on the same card.
* Use the search box to filter notes by a case-insensitive keyword over title and body.

## Data and privacy

* Notes live in a DSH storage domain (`desk_one`) managed by the official storage service; nothing leaves the machine.
* The panel talks to the plugin's own host routes under `/api/desk-one`; the client never touches storage directly.
* Agent tools (`desk_note_*`) read and write the same notes, so the model and the panel always see one dataset.

## Known limitations

* S0 only implements notes; tasks, boards, focus sessions and calendars are planned in the repository spec.
* Notes are not synced to any external service yet; Outlook and WeCom calendar sync arrives in a later step.
* The plugin has no settings page and no import/export screen yet.

## Development

* Plugin-level check: `npm run verify` inside this directory (typecheck, build, tests, pack check).
* Repository-level check: `pnpm run verify` at the repository root.
