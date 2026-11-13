/**
 * Notes wall rendering: the fixed-width, vertically infinite scrollport with its canvas of sticky
 * notes. Pure presentation — behavior (add / raise / commit / drag commits) is passed in.
 */

import type { ReactElement, RefObject } from 'react'
import { NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH } from '../../constants.js'
import type { DeskNote, NoteColor } from '../../contract.js'
import type { PlacedNote } from '../app/types.js'
import type { DeskTranslator } from '../app/types.js'
import { NoteCard } from './components/NoteCard.js'
import type { NoteDrag } from './hooks/useNoteDrag.js'

/** Render the notes wall. */
export function NotesWall(props: {
  readonly t: DeskTranslator
  readonly setWallRef: (node: HTMLDivElement | null) => void
  readonly canvasRef: RefObject<HTMLDivElement>
  readonly placed: readonly PlacedNote[]
  readonly loading: boolean
  readonly empty: boolean
  readonly animating: boolean
  readonly trashingIds: ReadonlySet<string>
  readonly onAddAt: (point: { readonly x: number; readonly y: number }) => void
  readonly onRaise: (noteId: string) => void
  readonly onDragStart: NoteDrag['startDrag']
  readonly onResizeStart: NoteDrag['startResize']
  readonly onColor: (note: DeskNote, color: NoteColor) => void
  readonly onTrash: (note: DeskNote) => void
  readonly onBodyCommit: (note: DeskNote, element: HTMLTextAreaElement) => void
}): ReactElement {
  const {
    t, setWallRef, canvasRef, placed, loading, empty, animating, trashingIds,
    onAddAt, onRaise, onDragStart, onResizeStart, onColor, onTrash, onBodyCommit,
  } = props
  return (
    <div
      className="dsh-desk-wall"
      ref={setWallRef}
      onDoubleClick={(event) => {
        // Listen on the scrollport: empty space below the canvas box is still part of the wall.
        // Notes and controls own their double-clicks; coordinates are canvas-relative.
        const target = event.target as HTMLElement
        if (target.closest('.dsh-desk-note, button, textarea, input, .dsh-desk-wall-tip')) return
        const canvas = canvasRef.current
        if (canvas === null) return
        const rect = canvas.getBoundingClientRect()
        onAddAt({
          x: event.clientX - rect.left - NOTE_DEFAULT_WIDTH / 2,
          y: event.clientY - rect.top - NOTE_DEFAULT_HEIGHT / 2,
        })
      }}
    >
      <div className="dsh-desk-wall-canvas" ref={canvasRef}>
        {loading
          ? <p className="dsh-desk-wall-hint">{t('state.loading')}</p>
          : empty
            ? (
                <p className="dsh-desk-wall-tip">
                  <span className="dsh-desk-wall-tip-main">{t('wall.tip')}</span>
                  <span className="dsh-desk-wall-tip-sub">{t('wall.tipAlt')}</span>
                </p>
              )
            : null}
        {placed.map((item, index) => (
          <NoteCard
            key={item.note.id}
            item={item}
            animating={animating || trashingIds.has(item.note.id)}
            animationDelayMs={animating ? Math.min(index, 8) * 18 : 0}
            t={t}
            onRaise={onRaise}
            onDragStart={onDragStart}
            onResizeStart={onResizeStart}
            onColor={onColor}
            onTrash={onTrash}
            onBodyCommit={onBodyCommit}
          />
        ))}
      </div>
    </div>
  )
}
