/**
 * Wall geometry: measures the visible wall and resolves every active note to concrete
 * coordinates, clamped to the wall so the wall never scrolls.
 *
 * Measurement happens in two places on purpose:
 * 1. the callback ref measures as soon as the node attaches (the panel can mount while hidden,
 *    in which case an effect-only measurement would capture 0 and stay there forever);
 * 2. a ResizeObserver keeps the size fresh for window/panel resizes.
 * Drag/resize also read the live node size at gesture start, so a stale state can never clamp a
 * note to the top-left corner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH, NOTE_MAX_SIZE, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH } from '../../../constants.js'
import type { DeskNote } from '../../../contract.js'
import type { PlacedNote, WallSize } from '../../app/types.js'
import { clamp, fallbackPosition } from '../../app/utils.js'

/** Resolve a note's on-wall box, clamping legacy undersized notes to the current limits. */
export function noteDisplaySize(note: DeskNote): { width: number; height: number } {
  return {
    width: clamp(note.width ?? NOTE_DEFAULT_WIDTH, NOTE_MIN_WIDTH, NOTE_MAX_SIZE),
    height: clamp(note.height ?? NOTE_DEFAULT_HEIGHT, NOTE_MIN_HEIGHT, NOTE_MAX_SIZE),
  }
}

export interface WallLayout {
  /** Mutable ref: the page attaches `setWallRef` (not this object) to the wall node. */
  readonly wallRef: { current: HTMLDivElement | null }
  readonly setWallRef: (node: HTMLDivElement | null) => void
  readonly wallSize: WallSize
  readonly placed: readonly PlacedNote[]
}

/** Read a node's box without trusting any stale state. */
export function measureWall(node: HTMLElement | null): WallSize {
  return node === null ? { width: 0, height: 0 } : { width: node.clientWidth, height: node.clientHeight }
}

export function useWallLayout(enabled: boolean, activeNotes: readonly DeskNote[]): WallLayout {
  const wallRef = useRef<HTMLDivElement | null>(null)
  const [wallSize, setWallSize] = useState<WallSize>({ width: 0, height: 0 })

  /** Attach + measure in one step: effects alone are too late when the panel mounts hidden. */
  const setWallRef = useCallback((node: HTMLDivElement | null): void => {
    wallRef.current = node
    if (node !== null) setWallSize(measureWall(node))
  }, [])

  useEffect(() => {
    if (!enabled) return
    const element = wallRef.current
    if (element === null) return
    const update = (): void => setWallSize(measureWall(element))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [enabled])

  const placed = useMemo<PlacedNote[]>(() => activeNotes.map((note, index) => {
    // Legacy notes can carry a size smaller than the current minimum (the old 120px limit clipped
    // the toolbar); clamp on render so the trash button stays inside every note.
    const width = clamp(note.width ?? NOTE_DEFAULT_WIDTH, NOTE_MIN_WIDTH, NOTE_MAX_SIZE)
    const height = clamp(note.height ?? NOTE_DEFAULT_HEIGHT, NOTE_MIN_HEIGHT, NOTE_MAX_SIZE)
    const fallback = fallbackPosition(index)
    const rawX = note.x ?? fallback.x
    const rawY = note.y ?? fallback.y
    // With no measured wall yet, keep the saved coordinates instead of clamping them to 0.
    const x = wallSize.width === 0 ? rawX : clamp(rawX, 0, wallSize.width - width)
    const y = wallSize.height === 0 ? rawY : clamp(rawY, 0, wallSize.height - height)
    return { note, x, y, width, height, zIndex: note.z ?? index + 1 }
  }), [activeNotes, wallSize.height, wallSize.width])

  return { wallRef, setWallRef, wallSize, placed }
}
