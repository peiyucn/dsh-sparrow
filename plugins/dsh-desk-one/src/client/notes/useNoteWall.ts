/**
 * Notes-wall behavior: capture via "+" / double-click, z-order raising, body commit and the
 * drag/resize commit hooks. The wall *rendering* lives in `NotesWall`; keeping the behavior here
 * means the shell only composes tabs, it does not own notes-wall rules.
 */

import { useCallback, useRef, useState } from 'react'
import { MAX_ACTIVE_NOTES, NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH } from '../../constants.js'
import type { DeskNote, NoteColor } from '../../contract.js'
import type { DeskPanelInjected } from '../install.js'
import type { DeskTranslator } from '../app/types.js'
import { messageOf } from '../app/utils.js'
import type { NotesData } from './hooks/useNotesData.js'
import type { TrashApi } from './hooks/useTrash.js'

/** Colours cycled for freshly captured notes (the default colour is left to the user). */
const STICKY_COLORS: readonly NoteColor[] = ['yellow', 'green', 'blue', 'pink']

/** The wall's behavior surface consumed by the shell and the header actions. */
export interface NoteWall {
  /** Guards double-click / double-tap while one create request is in flight. */
  readonly creating: boolean
  /** Raise one note to the top layer (click / drag / resize). */
  readonly raise: (noteId: string) => void
  /** Body blur commit; a brand-new blank note is dropped instead of leaving an empty sticker. */
  readonly commitBody: (note: DeskNote, element: HTMLTextAreaElement) => void
  /** Capture via "+" / double-click: place at the given point (or centre), top layer, focused. */
  readonly addNote: (point?: { readonly x: number; readonly y: number }) => Promise<void>
}

/** Bind the notes-wall behavior to the page's data, trash and wall geometry. */
export function useNoteWall(input: {
  readonly t: DeskTranslator
  readonly data: NotesData
  readonly trash: TrashApi
  readonly wallRef: { current: HTMLDivElement | null }
  readonly wallSize: { readonly width: number; readonly height: number }
  readonly selectNotesTab: () => void
  readonly createNote: DeskPanelInjected['createNote']
}): NoteWall {
  const { t, data, trash, wallRef, wallSize, selectNotesTab, createNote } = input
  const [creating, setCreating] = useState(false)
  const zTopRef = useRef(0)

  const raise = useCallback((noteId: string): void => {
    const current = data.notes.find(item => item.id === noteId)
    if (current === undefined) return
    const maxZ = data.notes.reduce((max, item) => Math.max(max, item.z ?? 0), zTopRef.current)
    if (current.z !== undefined && current.z === maxZ) return
    zTopRef.current = maxZ + 1
    const layer = zTopRef.current
    data.setNotes(list => list.map(item => item.id === noteId ? { ...item, z: layer } : item))
    data.savePatch(current, { z: layer })
  }, [data])

  const commitBody = useCallback((note: DeskNote, element: HTMLTextAreaElement): void => {
    const body = element.value
    if (body === note.body) return
    if (body.trim() === '' && note.body.trim() === '') {
      data.removeWithFeedback(note.id)
      return
    }
    data.savePatch(note, { body })
  }, [data])

  const addNote = useCallback(async (point?: { readonly x: number; readonly y: number }): Promise<void> => {
    if (creating) return
    if (trash.activeNotes.length >= MAX_ACTIVE_NOTES) {
      data.setActionError(t('wall.full'))
      return
    }
    const offset = (trash.activeNotes.length % 6) * 18
    const scrollTop = wallRef.current?.scrollTop ?? 0
    const anchorX = point === undefined ? Math.max(0, (wallSize.width - NOTE_DEFAULT_WIDTH) / 2) + offset : point.x
    const anchorY = point === undefined
      ? scrollTop + Math.max(0, (wallSize.height - NOTE_DEFAULT_HEIGHT) / 2) + offset
      : point.y
    const layer = data.notes.reduce((max, item) => Math.max(max, item.z ?? 0), zTopRef.current) + 1
    zTopRef.current = layer
    setCreating(true)
    try {
      const note = await createNote({
        body: '',
        color: STICKY_COLORS[trash.activeNotes.length % STICKY_COLORS.length] ?? 'yellow',
        x: Math.max(0, Math.round(anchorX)),
        y: Math.max(0, Math.round(anchorY)),
        z: layer,
      })
      // Show it on top immediately even when the running host ignores the create-time z.
      data.appendNote(note.z === layer ? note : { ...note, z: layer })
      selectNotesTab()
      trash.setShowTrash(false)
      if (note.z !== layer) data.persistZ(note, layer)
      requestAnimationFrame(() => {
        wallRef.current?.querySelector<HTMLTextAreaElement>(`[data-note-id="${note.id}"] textarea`)?.focus()
      })
    } catch (reason) {
      data.setActionError(t('state.saveFailed', { message: messageOf(reason) }))
    } finally {
      setCreating(false)
    }
  }, [createNote, creating, data, selectNotesTab, t, trash, wallRef, wallSize.height, wallSize.width])

  return { creating, raise, commitBody, addNote }
}
