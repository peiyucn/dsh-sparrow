/**
 * Drag and resize interactions for wall notes on a fixed-width, vertically infinite canvas.
 *
 * During a gesture we mutate the dragged element's style directly and only commit to React
 * state on pointer-up: that keeps each pointermove O(1) instead of re-rendering the whole wall,
 * which matters when the wall is full (100 notes by design). Dragging near the top/bottom edge
 * auto-scrolls the wall, and pointer coordinates are converted to canvas coordinates through
 * the wall's scrollTop so a note can be moved below the visible screen.
 */

import { useCallback } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react'
import { NOTE_MAX_POSITION, NOTE_MAX_SIZE, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH } from '../../../constants.js'
import type { DeskNote } from '../../../contract.js'
import type { DeskPanelInjected } from '../../install.js'
import type { PlacedNote, WallSize } from '../../app/types.js'
import { clamp } from '../../app/utils.js'

type Patch = Parameters<DeskPanelInjected['updateNote']>[0]['patch']

interface DragDeps {
  readonly wallSize: WallSize
  /** Scrollport (fixed width, vertically infinite). */
  readonly wallRef: { current: HTMLDivElement | null }
  /** Canvas inside the scrollport; note coordinates are canvas-relative and start below the glass chrome. */
  readonly canvasRef: RefObject<HTMLDivElement | null>
  readonly setNotes: Dispatch<SetStateAction<readonly DeskNote[]>>
  readonly savePatch: (note: DeskNote, patch: Patch) => void
}

export interface NoteDrag {
  readonly startDrag: (event: ReactPointerEvent<HTMLElement>, item: PlacedNote) => void
  readonly startResize: (event: ReactPointerEvent<HTMLElement>, item: PlacedNote) => void
}

/** Keep the wall scrolling while the pointer sits near an edge during a drag. */
const AUTO_SCROLL_EDGE = 36
const AUTO_SCROLL_STEP = 24

export function useNoteDrag({ wallSize, wallRef, canvasRef, setNotes, savePatch }: DragDeps): NoteDrag {
  const liveWidth = useCallback((): number => {
    const node = wallRef.current
    return node === null ? wallSize.width : (node.clientWidth || wallSize.width)
  }, [wallRef, wallSize])

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>, item: PlacedNote): void => {
    const target = event.target as HTMLElement
    // Textarea / buttons / resize grip own their gestures; only the paper itself drags.
    if (event.button !== 0 || target.closest('textarea,button,.dsh-desk-note-resize')) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const wall = wallRef.current
    const canvas = canvasRef.current
    const startRect = (canvas ?? wall)?.getBoundingClientRect()
    // Grab offset inside the note, expressed in canvas coordinates.
    const grabX = startX - (startRect?.left ?? 0) - item.x
    const grabY = startY - (startRect?.top ?? 0) - item.y
    const width = liveWidth()
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
      if (wall !== null) {
        const wallRect = wall.getBoundingClientRect()
        const viewportY = moveEvent.clientY
        if (viewportY > wallRect.bottom - AUTO_SCROLL_EDGE) {
          wall.scrollTop += Math.min(AUTO_SCROLL_STEP, viewportY - (wallRect.bottom - AUTO_SCROLL_EDGE))
        } else if (viewportY < wallRect.top + AUTO_SCROLL_EDGE) {
          wall.scrollTop = Math.max(0, wall.scrollTop - Math.min(AUTO_SCROLL_STEP, wallRect.top + AUTO_SCROLL_EDGE - viewportY))
        }
        const rectNow = (canvasRef.current ?? wall).getBoundingClientRect()
        currentX = clamp(Math.round(moveEvent.clientX - rectNow.left - grabX), 0, Math.max(0, width - item.width))
        currentY = clamp(Math.round(moveEvent.clientY - rectNow.top - grabY), 0, NOTE_MAX_POSITION)
      } else {
        currentX = clamp(Math.round(item.x + dx), 0, Math.max(0, width - item.width))
        currentY = clamp(Math.round(item.y + dy), 0, NOTE_MAX_POSITION)
      }
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
  }, [canvasRef, liveWidth, savePatch, setNotes, wallRef])

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>, item: PlacedNote): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const maxWidth = Math.max(NOTE_MIN_WIDTH, liveWidth() - item.x)
    // The canvas is vertically infinite: only the configured upper bound applies to height.
    const maxHeight = NOTE_MAX_SIZE
    const element = event.currentTarget.closest('.dsh-desk-note') as HTMLElement | null
    let currentWidth = item.width
    let currentHeight = item.height
    let moved = false
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      moved = true
      currentWidth = clamp(Math.round(item.width + moveEvent.clientX - startX), NOTE_MIN_WIDTH, Math.min(maxWidth, NOTE_MAX_SIZE))
      currentHeight = clamp(Math.round(item.height + moveEvent.clientY - startY), NOTE_MIN_HEIGHT, maxHeight)
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
  }, [liveWidth, savePatch, setNotes])

  return { startDrag, startResize }
}
