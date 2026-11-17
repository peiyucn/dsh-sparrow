

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH, NOTE_MAX_POSITION, NOTE_MAX_SIZE, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH } from '../../../constants.js'
import type { DeskNote } from '../../../contract.js'
import type { PlacedNote, WallSize } from '../../app/types.js'
import { clamp, fallbackPosition } from '../../app/utils.js'


export function noteDisplaySize(note: DeskNote): { width: number; height: number } {
  return {
    width: clamp(note.width ?? NOTE_DEFAULT_WIDTH, NOTE_MIN_WIDTH, NOTE_MAX_SIZE),
    height: clamp(note.height ?? NOTE_DEFAULT_HEIGHT, NOTE_MIN_HEIGHT, NOTE_MAX_SIZE),
  }
}


export function placeNote(note: DeskNote, index: number, wallSize: WallSize): PlacedNote {
  const { width, height } = noteDisplaySize(note)
  const fallback = fallbackPosition(index)
  const rawX = note.x ?? fallback.x
  const rawY = note.y ?? fallback.y
  const x = wallSize.width === 0 ? rawX : clamp(rawX, 0, Math.max(0, wallSize.width - width))
  const y = clamp(rawY, 0, NOTE_MAX_POSITION)
  return { note, x, y, width, height, zIndex: note.z ?? index + 1 }
}

export interface WallLayout {

  readonly wallRef: { current: HTMLDivElement | null }
  readonly setWallRef: (node: HTMLDivElement | null) => void
  readonly wallSize: WallSize
  readonly placed: readonly PlacedNote[]
}


export function measureWall(node: HTMLElement | null): WallSize {
  return node === null ? { width: 0, height: 0 } : { width: node.clientWidth, height: node.clientHeight }
}

export function useWallLayout(enabled: boolean, activeNotes: readonly DeskNote[]): WallLayout {
  const wallRef = useRef<HTMLDivElement | null>(null)
  const [wallSize, setWallSize] = useState<WallSize>({ width: 0, height: 0 })


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



  const placed = useMemo<PlacedNote[]>(
    () => activeNotes.map((note, index) => placeNote(note, index, wallSize)),
    [activeNotes, wallSize.height, wallSize.width],
  )

  return { wallRef, setWallRef, wallSize, placed }
}
