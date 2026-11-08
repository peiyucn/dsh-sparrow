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

/** Edge zone for drag auto-scroll, and its speed at the very edge (px per 60fps frame). */
const AUTO_SCROLL_EDGE = 40
const AUTO_SCROLL_MAX_SPEED = 6

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
    let pointerX = startX
    let pointerY = startY
    let frame = 0
    let lastFrame = 0
    /** Pin the note under the pointer in canvas coordinates (pointer + current scrollTop). */
    const placeFromPointer = (): void => {
      if (wall !== null) {
        const rectNow = (canvasRef.current ?? wall).getBoundingClientRect()
        currentX = clamp(Math.round(pointerX - rectNow.left - grabX), 0, Math.max(0, width - item.width))
        currentY = clamp(Math.round(pointerY - rectNow.top - grabY), 0, NOTE_MAX_POSITION)
      } else {
        currentX = clamp(Math.round(item.x + pointerX - startX), 0, Math.max(0, width - item.width))
        currentY = clamp(Math.round(item.y + pointerY - startY), 0, NOTE_MAX_POSITION)
      }
      element.style.left = `${currentX}px`
      element.style.top = `${currentY}px`
    }
    /**
     * Auto-scroll on a frame clock instead of one jump per pointermove: the scroll speed grows
     * with how deep the pointer is inside the edge zone and is time-normalized, so slow mouse
     * movement near the edge does not launch the note to the top.
     */
    const autoScroll = (time: number): void => {
      frame = 0
      const dt = lastFrame === 0 ? 16.7 : Math.min(32, Math.max(8, time - lastFrame))
      lastFrame = time
      if (wall !== null) {
        const rect = wall.getBoundingClientRect()
        const edge = Math.min(AUTO_SCROLL_EDGE, Math.max(12, rect.height / 3))
        let direction = 0
        let depth = 0
        if (pointerY > rect.bottom - edge) {
          direction = 1
          depth = (pointerY - (rect.bottom - edge)) / edge
        } else if (pointerY < rect.top + edge) {
          direction = -1
          depth = (rect.top + edge - pointerY) / edge
        }
        if (direction !== 0) {
          const step = Math.min(1, Math.max(0, depth)) * AUTO_SCROLL_MAX_SPEED * (dt / 16.7)
          const before = wall.scrollTop
          wall.scrollTop = Math.max(0, before + direction * step)
          if (wall.scrollTop !== before) placeFromPointer()
        }
      }
      if (moved) frame = window.requestAnimationFrame(autoScroll)
    }
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return
      moved = true
      pointerX = moveEvent.clientX
      pointerY = moveEvent.clientY
      placeFromPointer()
      if (frame === 0) frame = window.requestAnimationFrame(autoScroll)
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      frame = 0
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
