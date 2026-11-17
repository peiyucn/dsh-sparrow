


const MAX_EDIT_DISTANCE = 256


export interface LineChanges {

  readonly addedLines: readonly number[]

  readonly removed: number
}


interface EditScript {
  readonly added: readonly number[]
  readonly removed: number
}


function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}


function range(start: number, end: number): number[] {
  const lines: number[] = []
  for (let index = start; index < end; index += 1) lines.push(index + 1)
  return lines
}


export function lineChanges(oldText: string, newText: string): LineChanges | null {
  const oldLines = contentLines(oldText)
  const newLines = contentLines(newText)

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

    return { addedLines: range(0, newLines.length), removed: oldLines.length }
  }
  return { addedLines: script.added.map(index => start + index + 1), removed: script.removed }
}


function minimalScript(a: readonly string[], b: readonly string[]): EditScript | null {
  const n = a.length
  const m = b.length
  const limit = Math.min(MAX_EDIT_DISTANCE, n + m)
  const offset = limit + 1
  const furthest = new Int32Array(2 * limit + 3).fill(-1)
  furthest[offset + 1] = 0

  const trace: Int32Array[] = []
  for (let d = 0; d <= limit; d += 1) {
    if (d > 0) {

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


function backtrack(trace: readonly Int32Array[], dMax: number, n: number, m: number): EditScript {
  const added: number[] = []
  let x = n
  let y = m
  let removed = 0
  for (let d = dMax; d >= 1; d -= 1) {
    const snapshot = trace[d - 1] as Int32Array
    const base = d - 1

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
