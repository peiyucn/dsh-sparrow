/**
 * One sticky note on the wall.
 *
 * The textarea is uncontrolled on purpose: typing must not re-render the whole wall. External
 * changes (agent or reload) are pushed in via the sync effect, and a blur commits the body.
 */

import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { NOTE_COLORS } from '../../../constants.js'
import type { DeskNote, NoteColor } from '../../../contract.js'
import type { DeskTranslator, PlacedNote } from '../../app/types.js'

interface NoteCardProps {
  readonly item: PlacedNote
  readonly animating: boolean
  readonly animationDelayMs: number
  readonly t: DeskTranslator
  readonly onRaise: (id: string) => void
  readonly onDragStart: (event: ReactPointerEvent<HTMLElement>, item: PlacedNote) => void
  readonly onResizeStart: (event: ReactPointerEvent<HTMLElement>, item: PlacedNote) => void
  readonly onColor: (note: DeskNote, color: NoteColor) => void
  readonly onTrash: (note: DeskNote) => void
  readonly onBodyCommit: (note: DeskNote, element: HTMLTextAreaElement) => void
}

/** Local date label: short for the paper edge, full for the hover title. */
function createdLabel(iso: string): { readonly short: string; readonly full: string } | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const pad = (value: number): string => String(value).padStart(2, '0')
  const short = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return { short, full: `${short} ${pad(date.getHours())}:${pad(date.getMinutes())}` }
}

export function NoteCard({
  item, animating, animationDelayMs, t, onRaise, onDragStart, onResizeStart, onColor, onTrash, onBodyCommit,
}: NoteCardProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const { note } = item
  const display = note.body === '' ? note.title : note.body
  const created = createdLabel(note.createdAt)

  useEffect(() => {
    const element = textareaRef.current
    if (element === null) return
    // Never fight the user's cursor: only sync when the field is not focused.
    if (document.activeElement !== element && element.value !== display) element.value = display
  }, [display])

  return (
    <article
      className={animating ? 'dsh-desk-note dsh-desk-note-smashing' : 'dsh-desk-note'}
      data-color={note.color}
      data-note-id={note.id}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.zIndex,
        animationDelay: animating ? `${animationDelayMs}ms` : undefined,
      }}
      onPointerDown={(event) => {
        onRaise(note.id)
        onDragStart(event, item)
      }}
    >
      <div className="dsh-desk-note-bar">
        <span className="dsh-desk-note-grip" role="img" aria-label={t('action.drag')} title={t('action.drag')}>
          <i /><i /><i /><i /><i /><i />
        </span>
        <div className="dsh-desk-note-colors">
          {NOTE_COLORS.map(color => (
            <button
              key={color}
              type="button"
              className="dsh-desk-dot"
              data-color={color}
              data-active={note.color === color}
              aria-label={t(`color.${color}`)}
              title={t(`color.${color}`)}
              onClick={() => onColor(note, color)}
            />
          ))}
        </div>
        <button
          type="button"
          className="dsh-desk-iconbtn dsh-desk-iconbtn-sm dsh-desk-note-action"
          aria-label={t('action.trash')}
          title={t('action.trash')}
          onClick={() => onTrash(note)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
          </svg>
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="dsh-desk-note-body"
        // Legacy notes may only have a title; showing it as the body avoids an empty sticker.
        defaultValue={display}
        placeholder={t('note.placeholder')}
        spellCheck={false}
        onBlur={event => onBodyCommit(note, event.currentTarget)}
      />
      {created === null
        ? null
        : (
            <time
              className="dsh-desk-note-created"
              dateTime={note.createdAt}
              title={`${t('note.created')} ${created.full}`}
            >
              {created.short}
            </time>
          )}
      <span
        className="dsh-desk-note-resize"
        aria-hidden="true"
        onPointerDown={(event) => {
          onRaise(note.id)
          onResizeStart(event, item)
        }}
      />
    </article>
  )
}
