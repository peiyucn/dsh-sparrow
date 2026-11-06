/**
 * Wall geometry: measures the visible wall and resolves every active note to concrete
 * coordinates. Coordinates are clamped to the wall, which is what keeps the wall scroll-free
 * even after off-screen saves or window resizes.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH } from '../../../constants.js'
import type { DeskNote } from '../../../contract.js'
import type { PlacedNote, WallSize } from '../../app/types.js'
import { clamp, fallbackPosition } from '../../app/utils.js'

export interface WallLayout {
  /** Mutable ref: the page attaches it with a callback ref so both React 18/19 type shapes work. */
  readonly wallRef: { current: HTMLDivElement | null }
  readonly wallSize: WallSize
  readonly placed: readonly PlacedNote[]
}

export function useWallLayout(enabled: boolean, activeNotes: readonly DeskNote[]): WallLayout {
  const wallRef = useRef<HTMLDivElement | null>(null)
  const [wallSize, setWallSize] = useState<WallSize>({ width: 0, height: 0 })

  useEffect(() => {
    if (!enabled) return
    const element = wallRef.current
    if (element === null) return
    const update = (): void => setWallSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [enabled])

  const placed = useMemo<PlacedNote[]>(() => activeNotes.map((note, index) => {
    const width = note.width ?? NOTE_DEFAULT_WIDTH
    const height = note.height ?? NOTE_DEFAULT_HEIGHT
    const fallback = fallbackPosition(index)
    const rawX = note.x ?? fallback.x
    const rawY = note.y ?? fallback.y
    const x = wallSize.width === 0 ? rawX : clamp(rawX, 0, wallSize.width - width)
    const y = wallSize.height === 0 ? rawY : clamp(rawY, 0, wallSize.height - height)
    return { note, x, y, width, height, zIndex: note.z ?? index + 1 }
  }), [activeNotes, wallSize.height, wallSize.width])

  return { wallRef, wallSize, placed }
}
