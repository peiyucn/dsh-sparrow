/**
 * Owns the note collection: loading, optimistic patches and the per-note write chain.
 *
 * Every save of one note is serialized through a small promise chain so that z / position /
 * size / body writes cannot race each other; the queue always reads the latest revision,
 * which is what makes the optimistic `revision` guard work in practice.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DeskNote } from '../../../contract.js'
import type { DeskPanelInjected } from '../../install.js'
import type { DeskTranslator } from '../../app/types.js'
import { messageOf } from '../../app/utils.js'

type Patch = Parameters<DeskPanelInjected['updateNote']>[0]['patch']
type Actions = Pick<DeskPanelInjected, 'listNotes' | 'updateNote' | 'deleteNote'>

export interface NotesData {
  readonly notes: readonly DeskNote[]
  readonly setNotes: Dispatch<SetStateAction<readonly DeskNote[]>>
  readonly loading: boolean
  readonly loadError: string | null
  readonly actionError: string | null
  readonly setActionError: (message: string | null) => void
  readonly reload: () => Promise<void>
  readonly savePatch: (note: DeskNote, patch: Patch) => void
  readonly persistZ: (note: DeskNote, layer: number) => void
  readonly removeWithFeedback: (id: string) => void
  readonly appendNote: (note: DeskNote) => void
  readonly replaceNote: (note: DeskNote) => void
}

export function useNotesData(t: DeskTranslator, actions: Actions): NotesData {
  // Destructure so the memoized callbacks depend on stable function identities, not the wrapper.
  const { listNotes, updateNote, deleteNote } = actions
  const [notes, setNotes] = useState<readonly DeskNote[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  /** Latest notes for queued writes (they outlive the render that created them). */
  const notesRef = useRef<readonly DeskNote[]>(notes)
  notesRef.current = notes
  /** One write chain per note id. */
  const writeChains = useRef(new Map<string, Promise<void>>())
  const loadSeq = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const next = await listNotes()
      if (seq !== loadSeq.current) return
      setNotes(next)
      setLoadError(null)
    } catch (reason) {
      if (seq !== loadSeq.current) return
      setLoadError(messageOf(reason))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [listNotes])

  useEffect(() => { void reload() }, [reload])

  const enqueueWrite = useCallback((noteId: string, task: () => Promise<void>): void => {
    const previous = writeChains.current.get(noteId) ?? Promise.resolve()
    const next = previous.then(task, task)
    writeChains.current.set(noteId, next)
    void next.finally(() => {
      if (writeChains.current.get(noteId) === next) writeChains.current.delete(noteId)
    })
  }, [])

  const replaceNote = useCallback((updated: DeskNote): void => {
    setNotes(current => current.map(note => note.id === updated.id ? updated : note))
  }, [])
  const appendNote = useCallback((note: DeskNote): void => {
    setNotes(current => [...current, note])
  }, [])
  const removeNote = useCallback((id: string): void => {
    setNotes(current => current.filter(note => note.id !== id))
  }, [])

  /** Local state is updated optimistically elsewhere; this only handles persistence + feedback. */
  const savePatch = useCallback((note: DeskNote, patch: Patch): void => {
    enqueueWrite(note.id, async () => {
      const current = notesRef.current.find(item => item.id === note.id)
      if (current === undefined) return
      try {
        const updated = await updateNote({ id: note.id, expectedRevision: current.revision, patch })
        replaceNote(updated)
        setActionError(null)
      } catch (reason) {
        setActionError(t('state.saveFailed', { message: messageOf(reason) }))
        void reload()
      }
    })
  }, [enqueueWrite, reload, replaceNote, t, updateNote])

  /**
   * Persist a freshly created note's layer. The create call accepts z, but an older host may
   * ignore it; a follow-up patch keeps the "new note on top" promise without requiring a restart.
   */
  const persistZ = useCallback((note: DeskNote, layer: number): void => {
    enqueueWrite(note.id, async () => {
      try {
        const updated = await updateNote({ id: note.id, expectedRevision: note.revision, patch: { z: layer } })
        replaceNote({ ...updated, z: updated.z ?? layer })
      } catch {
        // Keep the local layer; the next drag/click will retry.
      }
    })
  }, [enqueueWrite, replaceNote, updateNote])

  const removeWithFeedback = useCallback((id: string): void => {
    enqueueWrite(id, async () => {
      try {
        await deleteNote(id)
        removeNote(id)
        setActionError(null)
      } catch (reason) {
        setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      }
    })
  }, [deleteNote, enqueueWrite, removeNote, t])

  return {
    notes, setNotes, loading, loadError, actionError, setActionError,
    reload, savePatch, persistZ, removeWithFeedback, appendNote, replaceNote,
  }
}
