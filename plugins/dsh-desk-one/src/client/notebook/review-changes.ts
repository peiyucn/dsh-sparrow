/**
 * Line-level change detection for the review code view.
 *
 * The code view paints this round's changed lines in place, while the bottom "本轮改动" bar reports
 * the same round's ± counts. The official `DiffBlock` only exports `diffTotals` and the rendered
 * block, not the edit script, so the script is reproduced here with the same rules: lines are the
 * tokens, the search is Myers with the official 256-edit cap, and exceeding the cap falls back to a
 * whole-fragment replacement (every old line removed, every new line added). Keeping one script for
 * both the highlight and the counts is what makes the two readings agree.
 */

/** Same edit-search cap as the official diff block (`MAX_DIFF_EDIT_LENGTH`). */
const MAX_EDIT_DISTANCE = 256

/** One round's line changes against the round baseline. */
export interface LineChanges {
  /** 1-based line numbers of the new text that the edit script inserts (changed lines included). */
  readonly addedLines: readonly number[]
  /** How many old-side lines the edit script deletes. */
  readonly removed: number
}

/** Endpoint of the edit script: inserted 0-based new-line indexes plus the deletion count. */
interface EditScript {
  readonly added: readonly number[]
  readonly removed: number
}

/**
 * Split text into the line tokens the official diff compares: empty text carries zero lines and a
 * single trailing newline terminates the last line instead of adding an empty one.
 */
function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/** Build one line range `[start, end)` as 1-based numbers. */
function range(start: number, end: number): number[] {
  const lines: number[] = []
  for (let index = start; index < end; index += 1) lines.push(index + 1)
  return lines
}

/**
 * Diff one round's baseline against the current text at line granularity.
 * @param oldText - the round baseline (the file as it was when this review session opened).
 * @param newText - the current file text.
 * @returns the changed lines, or null when both sides carry identical content lines.
 */
export function lineChanges(oldText: string, newText: string): LineChanges | null {
  const oldLines = contentLines(oldText)
  const newLines = contentLines(newText)
  // Shared prefix / suffix never changes; trimming keeps the bounded edit search cheap.
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1
  let oldEnd = oldLines.length
  let newEnd = newLines.length
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  if (oldEnd === start && newEnd === start) return null
  if (oldEnd === start) return { addedLines: range(start, newEnd), removed: 0 }
  if (newEnd === start) return { addedLines: [], removed: oldEnd - start }
  const script = minimalScript(oldLines.slice(start, oldEnd), newLines.slice(start, newEnd))
  if (script === null) {
    // Mirrors the official whole-fragment fallback: a diff past the cap counts every line as changed.
    return { addedLines: range(0, newLines.length), removed: oldLines.length }
  }
  return { addedLines: script.added.map(index => start + index + 1), removed: script.removed }
}

/**
 * Myers O(ND) line edit script, bounded by {@link MAX_EDIT_DISTANCE}.
 * @returns the script, or null when the edit distance exceeds the cap.
 */
function minimalScript(a: readonly string[], b: readonly string[]): EditScript | null {
  const n = a.length
  const m = b.length
  const limit = Math.min(MAX_EDIT_DISTANCE, n + m)
  const offset = limit + 1
  const furthest = new Int32Array(2 * limit + 3).fill(-1)
  furthest[offset + 1] = 0
  /** `trace[d]` is the search front after iteration `d` (k range `[-(d+1), d+1]` compacted). */
  const trace: Int32Array[] = []
  for (let d = 0; d <= limit; d += 1) {
    if (d > 0) {
      // Only the k range the backtrack reads is retained: V(d-1) over [-(d-1), d-1].
      const snapshot = new Int32Array(2 * d - 1)
      for (let k = -(d - 1); k <= d - 1; k += 1) snapshot[k + d - 1] = furthest[offset + k]
      trace.push(snapshot)
    }
    for (let k = -d; k <= d; k += 2) {
      const left = furthest[offset + k - 1]
      const up = furthest[offset + k + 1]
      let x: number
      if (k === -d || (k !== d && left < up)) x = up
      else x = left + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x += 1
        y += 1
      }
      furthest[offset + k] = x
      if (x >= n && y >= m) return backtrack(trace, d, n, m)
    }
  }
  return null
}

/**
 * Walk the retained search fronts back from (n, m) into an edit script.
 * @param trace - `trace[d-1]` holds V(d-1) over the k range the step needs.
 * @param dMax - edit distance at which the search reached the end.
 * @returns inserted 0-based new-line indexes (ascending) and the deletion count.
 */
function backtrack(trace: readonly Int32Array[], dMax: number, n: number, m: number): EditScript {
  const added: number[] = []
  let x = n
  let y = m
  let removed = 0
  for (let d = dMax; d >= 1; d -= 1) {
    const snapshot = trace[d - 1] as Int32Array
    const base = d - 1
    // V(d-1) only defines |k| <= d-1; the ±d probes below are guarded by the k edges.
    const at = (k: number): number => snapshot[k + base] as number
    const k = x - y
    const prevK = k === -d ? k + 1 : k === d ? k - 1 : at(k - 1) < at(k + 1) ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x -= 1
      y -= 1
    }
    if (x === prevX) {
      added.push(y - 1)
      y -= 1
    } else {
      x -= 1
      removed += 1
    }
  }
  added.reverse()
  return { added, removed }
}
