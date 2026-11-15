# Changelog

English | [简体中文](CHANGELOG.zh-CN.md)

All notable changes to `dsh-desk-one` are documented here. The format follows Keep a Changelog and the version numbers mirror the official DSH release line.

## [0.2.2-rc.3] - 2026-11-14

* **First release — Desk One**: one **Desk One** entry in the left sidebar hosting a tabbed panel (order: Notes wall / Task board / Annotations / Schedule / Sessions); each tab can be pinned as its own sidebar shortcut (live add / remove, kept across restarts), and the panel remembers the last tab you were on. The panel chrome follows the official conversation header; the glass material is used only when theme-tone is active.

* **Annotations**: link a DSH workspace as the notebook library and the **Annotations** tab now stacks the search field above the four views in one control, with the white **Workspace files** button at the right (the two top cells share one width and height) opening the whole workspace's official files page, so you can pick a file and start annotating; the pager sits in the list header. The workspace switch lives in the panel's top bar (registered workspaces + create), with no folder or unlink options; new-note creation is gone. Opening a page starts or reuses that note's annotation Session; the official preview header gets the same ✦ button for any Markdown / text file inside a registered workspace.

* **With DSH**: the header brand slot is one split **「✦」 Desk One｜Talk to Me** button (the badge stays unchanged on the left, the right half is a line frame with no fill) offering prefilled prompts for the current tab (Notes wall / Task board / Annotations / Schedule / Sessions); the empty notes wall gets a "「note this down…」" entry; the empty To-do lane repeats the same wording as plain text, with no click action. Picking one opens (or reuses) the Workspace blank, appends the half-sentence prompt to its composer draft and focuses it — **nothing is sent automatically**; with no workspace the official notice applies. The info popover now explains the two ways plus examples. Schedule and Sessions only offer read-only / tidy-up prompts, no write entries.

* **Annotation view**: a dedicated annotations tab with exact source line numbers; select lines to annotate inline (edit / delete drafts), **Submit annotations** inserts one numbered message into the annotation Session's composer without sending, and **This round's changes** shows the diff against a per-review-Session baseline and highlights the changed lines in place; submitted annotation records can be read back and deleted. Reopening a note returns to that note's own openable annotation Session (never your current conversation), and annotation Sessions are marked in the sidebar with the official-blue **Desk One mark (「✦」)** (the **Annotate** entry in the official file preview header shares that mark) and show an in-composer guidance hint while the annotations view is on screen.

* **Notes wall**: a free-form sticky canvas — add a sticky with **Capture** or by double-clicking, edit in place, drag / resize / change colour / layer, with each sticky showing its creation date. The wall is capped at 100 notes and the trash at 200; the trash supports restore and permanent delete, and **Smash!** clears the whole wall into the trash after a two-step confirmation.

* **Tasks**: a fixed three-lane board (To do / Doing / Done) with colour tags, day-granular due dates, pointer dragging with a precise insertion line, three sort views (manual / created / due), one-level groups that can be dragged, archived and restored as a unit, and a **Done** archive. Task cards link DSH sessions with **@** and show each session chip's live state and a quick preview.

* **Schedule**: a read-only page aggregating WeCom CalDAV, iCloud CalDAV, personal Outlook through Microsoft Graph sign-in, and any public ICS subscriptions. It has a Start / Today / Upcoming top row, month / week / calendar views, an event card anchored at the click, and a per-source calendar settings page with manual sync, per-calendar visibility and colour. The panel syncs on open and then every 15 minutes; sync failures are surfaced as a badge on the **Calendar settings** action and detailed in the failing source card.

* **Schedule sync is more robust**: expired Outlook login flows are cleaned up, an invalid callback address is reported clearly, and the sync report now counts only the events actually mirrored.

* **Sessions**: the shared agent-session catalog — active sessions grouped by workspace, plus archived / stray / trash sections with unarchive, move-to-trash, restore and permanent delete (deleting a regular session requires typing its exact title), parent/child nesting, and copy-name / copy-session-id buttons on every row.

* **Agent surface**: 19 `desk_*` tools (notes, tasks, task groups, schedule and the read-only notebook page search) read and write the same data as the UI, and a bundled `desk-one` operating guide skill (on by default, also available via `/`) explains which object to use and the list → revision → update flow.

* **Dates and narrow panes**: dates and times follow the UI language (for example a Chinese UI shows "11月13日"), and narrow panels reflow the schedule top cards, the annotation lists and the task lanes instead of overflowing sideways.

* **Data and privacy**: notes, tasks, schedule mirror and annotation records live in the profile-level `desk_one` DSH storage domain; schedule credentials (sync password / OAuth refresh token / subscription link) live only in the official credential store, and nothing is written to logs, HTML or exports.

* **Archive uses the official path**: archiving or unarchiving a session from Desk One now goes through the official archive API — an active session is refused with a "stop it first" message, archived sessions drop their pin, and the official follow-up (for example the rc.2+ worktree reclamation) runs exactly as it does from the official session menu.

* **Pinned sidebar shortcuts**: clicking a pinned shortcut (for example Sessions) now always returns to that tab, even after switching tabs inside its panel.

* **Sessions tab icon**: the Sessions tab and its pinned sidebar entry use the official session-list glyph (a speech bubble with two lines) instead of the official New Session icon, so the two no longer look alike.

* **Desk One mark**: the sidebar entry and the header badge now use a **「✦」 mark** (an upper-left 「 and a lower-right 」 corner frame around a spark) instead of a rounded square, matching the star cue of the **Talk to DSH** entry.

* **Make a wish**: the "…" menu at the end of the tab strip now has a **Make a wish** row that prefills your idea into the conversation and turns it into a GitHub feature-issue draft (draft first, never published automatically, no private content).

* **Known limits**: the schedule is read-only (no local event creation, no write-back, and no publishing your own calendar as an iCalendar feed; subscribing to external ICS links is supported). Focus sessions, cross-object search, data export / import and richer task fields are planned in the repository spec.
