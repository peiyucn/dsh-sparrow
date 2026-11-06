/**
 * Drag and resize interactions for wall notes.
 *
 * During a gesture we mutate the dragged element's style directly and only commit to React
 * state on pointer-up: that keeps each pointermove O(1) instead of re-rendering the whole wall,
 * which matters when the wall is full (100 notes by design).
 */

import { useCallback } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import { NOTE_MAX_SIZE, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH } from '../../../constants.js'
import type { DeskNote } from '../../../contract.js'
import type { DeskPanelInjected } from '../../install.js'
import type { PlacedNote, WallSize } from '../../app/types.js'
import { clamp } from '../../app/utils.js'

type Patch = Parameters<DeskPanelInjected['updateNote']>[0]['patch']

interface DragDeps {
  readonly wallSize: WallSize
  /** Live node ref: gestures read the real size at start so stale state cannot clamp to 0. */
  readonly wallRef: { current: HTMLDivElement | null }
  readonly setNotes: Dispatch<SetStateAction<readonly DeskNote[]>>
  readonly savePatch: (note: DeskNote, patch: Patch) => void
}

export interface NoteDrag {
  readonly startDrag: (event: ReactPointerEvent<HTMLElement>, item: PlacedNote) => void
  readonly startResize: (event: ReactPointerEvent<HTMLElement>, item: PlacedNote) => void
}

export function useNoteDrag({ wallSize, wallRef, setNotes, savePatch }: DragDeps): NoteDrag {
  /** Prefer the live box (gesture-time) over the possibly stale measured state. */
  const liveSize = useCallback((): WallSize => {
    const node = wallRef.current
    if (node === null) return wallSize
    return { width: node.clientWidth || wallSize.width, height: node.clientHeight || wallSize.height }
  }, [wallRef, wallSize])

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>, item: PlacedNote): void => {
    const target = event.target as HTMLElement
    // Textarea / buttons / resize grip own their gestures; only the paper itself drags.
    if (event.button !== 0 || target.closest('textarea,button,.dsh-desk-note-resize')) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const size = liveSize()
    const maxX = Math.max(0, size.width - item.width)
    const maxY = Math.max(0, size.height - item.height)
    const element = event.currentTarget
    // A slight tilt while dragging sells the "paper" metaphor; removed on drop/cancel.
    element.dataset.dragging = 'true'
    let currentX = item.x
    let currentY = item.y
    let moved = false
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return
      moved = true
      currentX = clamp(Math.round(item.x + dx), 0, maxX)
      currentY = clamp(Math.round(item.y + dy), 0, maxY)
      element.style.left = `${currentX}px`
      element.style.top = `${currentY}px`
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      delete element.dataset.dragging
      if (!moved) return
      setNotes(current => current.map(note => note.id === item.note.id
        ? { ...note, x: currentX, y: currentY }
        : note))
      savePatch(item.note, { x: currentX, y: currentY })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }, [liveSize, savePatch, setNotes])

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>, item: PlacedNote): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const size = liveSize()
    const maxWidth = Math.max(NOTE_MIN_WIDTH, size.width - item.x)
    const maxHeight = Math.max(NOTE_MIN_HEIGHT, size.height - item.y)
    const element = event.currentTarget.closest('.dsh-desk-note') as HTMLElement | null
    let currentWidth = item.width
    let currentHeight = item.height
    let moved = false
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      moved = true
      currentWidth = clamp(Math.round(item.width + moveEvent.clientX - startX), NOTE_MIN_WIDTH, Math.min(maxWidth, NOTE_MAX_SIZE))
      currentHeight = clamp(Math.round(item.height + moveEvent.clientY - startY), NOTE_MIN_HEIGHT, Math.min(maxHeight, NOTE_MAX_SIZE))
      if (element !== null) {
        element.style.width = `${currentWidth}px`
        element.style.height = `${currentHeight}px`
      }
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!moved) return
      setNotes(current => current.map(note => note.id === item.note.id
        ? { ...note, width: currentWidth, height: currentHeight }
        : note))
      savePatch(item.note, { width: currentWidth, height: currentHeight })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }, [liveSize, savePatch, setNotes])

  return { startDrag, startResize }
}
