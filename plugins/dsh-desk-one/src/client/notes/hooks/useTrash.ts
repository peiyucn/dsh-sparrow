/**
 * Trash view + wall clean-up behavior.
 *
 * Deletions are soft (notes move to the trash), but both are capped: the wall by
 * MAX_ACTIVE_NOTES and the trash by MAX_TRASH_NOTES, so the collection stays small enough
 * to render and sync without pagination. Both one-note trashing and "Smash!" play the same
 * fly-away animation before the optimistic removal, which prevents a flash-back while the
 * server round-trip settles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { MAX_TRASH_NOTES, TRASH_PAGE_SIZE } from '../../../constants.js'
import type { DeskNote } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'

/** Whole-wall animation window: enough for the 260ms keyframes plus the stagger. */
const SMASH_ANIMATION_MS = 480
/** Single-note animation window (same keyframes, no stagger). */
const NOTE_TRASH_ANIMATION_MS = 300

interface TrashDeps {
  readonly notes: readonly DeskNote[]
  readonly setNotes: Dispatch<SetStateAction<readonly DeskNote[]>>
  readonly savePatch: (note: DeskNote, patch: { trashed?: boolean }) => void
  readonly removeWithFeedback: (id: string) => void
  readonly setActionError: (message: string | null) => void
  readonly t: DeskTranslator
}

interface TrashApi {
  readonly showTrash: boolean
  readonly setShowTrash: Dispatch<SetStateAction<boolean>>
  readonly toggleTrash: () => void
  readonly activeNotes: readonly DeskNote[]
  readonly trashedNotes: readonly DeskNote[]
  readonly visibleTrashed: readonly DeskNote[]
  readonly trashVisible: number
  readonly loadMoreTrash: () => void
  readonly confirmClearTrash: boolean
  readonly clearTrash: () => void
  readonly trashNote: (note: DeskNote) => void
  readonly trashingIds: ReadonlySet<string>
  readonly smashing: boolean
  readonly confirmSmash: boolean
  readonly smashWall: () => void
}

export function useTrash({
  notes, setNotes, savePatch, removeWithFeedback, setActionError, t,
}: TrashDeps): TrashApi {
  const [showTrash, setShowTrash] = useState(false)
  const [confirmClearTrash, setConfirmClearTrash] = useState(false)
  const [confirmSmash, setConfirmSmash] = useState(false)
  const [smashing, setSmashing] = useState(false)
  const [trashVisible, setTrashVisible] = useState(TRASH_PAGE_SIZE)
  const [trashingIds, setTrashingIds] = useState<ReadonlySet<string>>(() => new Set())
  const smashTimer = useRef<number | null>(null)
  const trashTimers = useRef(new Map<string, number>())

  useEffect(() => () => {
    if (smashTimer.current !== null) window.clearTimeout(smashTimer.current)
    for (const timer of trashTimers.current.values()) window.clearTimeout(timer)
    trashTimers.current.clear()
  }, [])

  // An armed destructive action is a modal-ish intent: clicking anywhere else or pressing Esc
  // cancels it. Covers both Smash and "clear trash" so the button never stays red.
  useEffect(() => {
    if (!confirmSmash && !confirmClearTrash) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (target?.closest('[data-smash-confirm], [data-clear-trash-confirm]') != null) return
      setConfirmSmash(false)
      setConfirmClearTrash(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setConfirmSmash(false); setConfirmClearTrash(false) }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmSmash, confirmClearTrash])

  const activeNotes = useMemo(() => notes.filter(note => !note.trashed), [notes])
  const trashedNotes = useMemo(() => notes.filter(note => note.trashed), [notes])
  const visibleTrashed = useMemo(() => trashedNotes.slice(0, trashVisible), [trashedNotes, trashVisible])

  const loadMoreTrash = useCallback((): void => {
    setTrashVisible(current => current + TRASH_PAGE_SIZE)
  }, [])

  const resetTrashView = useCallback((): void => {
    setConfirmClearTrash(false)
    setConfirmSmash(false)
    setTrashVisible(TRASH_PAGE_SIZE)
  }, [])

  const toggleTrash = useCallback((): void => {
    resetTrashView()
    setShowTrash(current => !current)
  }, [resetTrashView])

  const clearTrash = useCallback((): void => {
    if (!confirmClearTrash) {
      setConfirmClearTrash(true)
      return
    }
    setConfirmClearTrash(false)
    setTrashVisible(TRASH_PAGE_SIZE)
    for (const note of trashedNotes) removeWithFeedback(note.id)
  }, [confirmClearTrash, removeWithFeedback, trashedNotes])

  /** Soft-delete one note after its fly-away animation; refuses when the trash is full. */
  const trashNote = useCallback((note: DeskNote): void => {
    if (trashingIds.has(note.id)) return
    if (trashedNotes.length >= MAX_TRASH_NOTES) {
      setActionError(t('trash.full'))
      setShowTrash(true)
      return
    }
    setActionError(null)
    setTrashingIds(current => {
      const next = new Set(current)
      next.add(note.id)
      return next
    })
    const timer = window.setTimeout(() => {
      trashTimers.current.delete(note.id)
      setTrashingIds(current => {
        const next = new Set(current)
        next.delete(note.id)
        return next
      })
      // Optimistic removal first, persistence second: no flash-back while the write settles.
      setNotes(current => current.map(item => item.id === note.id ? { ...item, trashed: true } : item))
      savePatch(note, { trashed: true })
    }, NOTE_TRASH_ANIMATION_MS)
    trashTimers.current.set(note.id, timer)
  }, [savePatch, setActionError, setNotes, t, trashedNotes.length, trashingIds])

  /** Smash: two-step confirmation then move the whole wall into the trash. */
  const smashWall = useCallback((): void => {
    if (smashing) return
    // The button is permanent; with an empty wall it simply does nothing.
    if (activeNotes.length === 0) return
    if (!confirmSmash) {
      setConfirmSmash(true)
      setActionError(null)
      return
    }
    setConfirmSmash(false)
    if (trashedNotes.length + activeNotes.length > MAX_TRASH_NOTES) {
      setActionError(t('trash.full'))
      setShowTrash(true)
      return
    }
    setSmashing(true)
    const targets = activeNotes
    smashTimer.current = window.setTimeout(() => {
      smashTimer.current = null
      const ids = new Set(targets.map(note => note.id))
      setNotes(current => current.map(item => ids.has(item.id) ? { ...item, trashed: true } : item))
      setSmashing(false)
      for (const note of targets) savePatch(note, { trashed: true })
    }, SMASH_ANIMATION_MS)
  }, [activeNotes, confirmSmash, savePatch, setActionError, setNotes, smashing, t, trashedNotes.length])

  return {
    showTrash, setShowTrash, toggleTrash,
    activeNotes, trashedNotes, visibleTrashed, trashVisible, loadMoreTrash,
    confirmClearTrash, clearTrash,
    trashNote, trashingIds, smashing, confirmSmash, smashWall,
  }
}
