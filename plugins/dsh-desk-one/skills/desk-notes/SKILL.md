---
name: desk-notes
description: "Review loop for AI-written notes in Desk One. Use when a review annotation arrives from the notebook panel (quoted as 【批注 N】), when the user asks to list or answer review annotations, or when the user wants to search the notes library by frontmatter (type/date/tag). Explains the annotation anchors, the open/answered/resolved/orphaned statuses, and the human-in-the-loop rule that only the human resolves."
---

# desk-notes — the review half of "AI writes, human reviews"

The user's notebook is a local library of `.md` pages (a DSH workspace picked in the
Desk One panel). The human reads pages in the right-sidebar review tab and leaves
**annotations**; you answer them by editing the page and replying in the thread.
The human keeps the final say: **only the human resolves a thread.**

## Where the truth lives

- The `.md` file **is** the note. Read and edit it with the official file tools.
- Annotations live in Desk One's own store, keyed by a library-relative `path`.
  **Never write an annotation into the file** — it would corrupt the note and show
  up in other editors.
- Paths in annotation tools are relative to the library root (e.g. `Diary/2026-11-11.md`),
  never absolute.

## The loop

1. The human selects text (quote anchor) or a frontmatter field (field anchor) and
   writes an annotation. Its status starts as `open` (待处理).
2. The annotation reaches you as a quoted block, usually shaped like:

   ```
   【批注 3】Diary/快速笔记/example.md
   > quoted body text            (quote anchor)
   field: value                  (field anchor, instead of the quote)
   我：the human's request
   AI：what an earlier turn answered
   ```

3. Read the page (official file tools) and decide the change. The thread history is
   there so you do not repeat work an earlier turn already settled.
4. Edit the markdown with the official file tools. Keep unrelated parts untouched;
   match the page's existing style (tone, heading depth, bullet style).
5. Reply with `desk_note_annotation_reply` (see below). The reply moves the thread to
   `answered` (待接受) — the human then accepts it (`resolved`) or keeps discussing.
6. If no edit is needed, still answer: `desk_note_annotation_reply` with the reason,
   or `desk_note_annotation_answered` when a reply would add nothing.

## Statuses

| status | meaning | who sets it |
| --- | --- | --- |
| `open` | waiting for work (a human reply also reopens a thread) | human action |
| `answered` | you replied; waiting for the human to accept | your tools |
| `resolved` | the human accepted this round | **human only** |
| `orphaned` | the anchor no longer exists in the page | human / detection |

Replying is how a discussion reopens; there is no separate "reopen" step for you.
**Never claim a thread is resolved, and never ask to resolve it** — acceptance is the
human's gesture.

## Tools

- `desk_note_annotation_list({ path?, status?, limit? })` — threads newest-first.
  Call it at the start of a review turn; `status: "open"` finds work waiting for you.
- `desk_note_annotation_reply({ id, expected_revision, body })` — answer with what you
  changed (file + section) and what you left alone. `expected_revision` comes from the
  list; a stale revision is rejected, so re-read the thread instead of retrying blindly.
- `desk_note_annotation_answered({ id, expected_revision })` — when the human's point
  needed no change and a written reply adds nothing.
- `desk_note_search({ query?, type?, tag? })` — frontmatter-aware library search
  (title/path/body text plus exact `type` / `tag`). It returns index entries, not page
  contents: open the page with the official tools.

Do **not** add wrapper tools for reading or writing files: the official file tools
(`read` / `write` / `edit` / `grep`) already cover that and stay sandboxed.

## Rules of thumb

- Quote anchors go stale when the text changes. If the quoted passage is gone, say so
  and ask where it moved — never anchor a change on a guess.
- One annotation, one concern. If the human raises a second topic in the same thread,
  answer both explicitly rather than silently merging them.
- Keep replies short and concrete: what changed, where, and anything you rejected and
  why. The human reads them to decide accept/reject.
- Do not `git commit` the notes library unless the user asks; the library may be under
  its own version control.
- `note2md` (bundled with this plugin) owns library initialization, OneNote import and
  page templates. Use it for **creating** pages/templates; use this skill for review.
