---
name: desk-review
description: "Review sessions for plain-text files in Desk One. Use when a review batch arrives from the notebook panel (numbered blocks like 【批注 N】 with a quoted passage and the human's request), when the user asks to continue a review, or when the user wants to search the notes library by frontmatter (desk_note_search). Explains the stateless review model: the review state lives in the conversation, the file stays the only content truth, and only the human decides when a round is done."
---

# desk-review — the review half of "AI writes, human reviews"

The Desk One notebook is a local library of text files (a DSH workspace picked in the
panel). The human reads a file in the right-sidebar review tab, writes one or more
annotations, and submits the whole batch as a single message. You answer that message
by editing the file and replying **per numbered item**, in the same conversation.

There is **no annotation object in storage**: the batch in the conversation is the only
record of the review, and the file is the only content truth. Never write review
comments into the file itself.

## What arrives

A batch is a numbered block, usually shaped like:

```
【批注 1】
> quoted passage from the file
the human's request for this passage

【批注 2】
> another passage
another request
```

The file path/title is either in the surrounding message, in the review tab the human
is looking at, or implied by the review session. If you cannot tell which file is being
reviewed, ask before editing.

## The loop

1. Read the file with the official file tools.
2. Work item by item, in the batch's order: apply the smallest edit that satisfies the
   request, match the file's existing style (tone, heading depth, bullet style, language),
   and leave everything unrelated untouched.
3. Reply **per item**, numbered the same way: what changed and where, or — if you did
   not change something — why (the passage is already correct, the request is
   ambiguous, the edit would break structure, and so on). Never silently skip an item.
4. Do **not** declare the review finished or accepted. Only the human decides that,
   by accepting the result or by sending the next round.
5. If a later message references an earlier number ("第 2 条再改"), that is a new
   round on the changed text: re-read the file, make the edit, and reply again.

## Rules

- Never write markup such as `【批注 N】` or review status into the file.
- Never invent file content: if a quoted passage cannot be found, say where you looked
  and ask whether the human re-attached the right file (the panel reports a missing
  target when the file moved or was renamed).
- One item may need several edits; report the net result, not every keystroke.
- If the batch is empty or unclear, ask one concise question instead of guessing.
- Search the library only when the human asks for it: `desk_note_search` takes free
  text plus optional exact `type` / `tag` frontmatter filters.
