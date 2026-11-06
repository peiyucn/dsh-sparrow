/**
 * dsh-desk-one main panel.
 *
 * This file is composition only: state lives in the hooks under `hooks/`, rendering in the
 * components under `components/`. The notes wall is a fixed, scroll-free board; the collection
 * itself is capped (100 on the wall, 200 in the trash) so no pagination of the wall is needed.
 */

import { useCallback, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  LOCALE_NAMESPACE, MAX_ACTIVE_NOTES, NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH, TAB_STORAGE_KEY,
} from '../../constants.js'
import type { DeskNote, NoteColor } from '../../contract.js'
import { NoteCard } from '../notes/components/NoteCard.js'
import { TrashPanel } from '../notes/components/TrashPanel.js'
import { WallActions } from '../notes/components/WallActions.js'
import { TaskBoard } from '../tasks/components/TaskBoard.js'
import { useNoteDrag } from '../notes/hooks/useNoteDrag.js'
import { useNotesData } from '../notes/hooks/useNotesData.js'
import { useTrash } from '../notes/hooks/useTrash.js'
import { useWallLayout } from '../notes/hooks/useWallLayout.js'
import type { DeskPanelInjected } from '../install.js'
import type { DeskTranslator, Tab } from './types.js'
import { messageOf, readInitialTab } from './utils.js'

/** Page props: main-panel owner share + injected actions + locale seat (assembled by the host). */
export type DeskPanelProps = PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

/** Colours cycled for freshly captured notes (default colour is left to the user). */
const STICKY_COLORS: readonly NoteColor[] = ['yellow', 'green', 'blue', 'pink']

export function DeskOnePage(props: DeskPanelProps) {
  const {
    listNotes, updateNote, deleteNote, createNote, t,
    listTasks, createTask, updateTask, deleteTask,
    listGroups, createGroup, updateGroup, moveGroup, deleteGroup,
  } = props
  const [tab, setTab] = useState<Tab>(readInitialTab)
  /** Guards double-click / double-tap while one create request is in flight. */
  const [creating, setCreating] = useState(false)
  const zTopRef = useRef(0)

  const selectTab = useCallback((next: Tab): void => {
    setTab(next)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next)
    } catch {
      // Storage unavailable (private mode): keep the choice for this session only.
    }
  }, [])

  const data = useNotesData(t, { listNotes, updateNote, deleteNote })
  const trash = useTrash({
    notes: data.notes,
    setNotes: data.setNotes,
    savePatch: data.savePatch,
    removeWithFeedback: data.removeWithFeedback,
    setActionError: data.setActionError,
    t,
  })
  const { wallRef, setWallRef, wallSize, placed } = useWallLayout(tab === 'notes', trash.activeNotes)
  const drag = useNoteDrag({ wallSize, wallRef, setNotes: data.setNotes, savePatch: data.savePatch })

  /** Click / drag / resize raises one note to the top; skip the write when it already is. */
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

  /** Body blur commits; a brand-new blank note is dropped instead of leaving an empty sticker. */
  const commitBody = useCallback((note: DeskNote, element: HTMLTextAreaElement): void => {
    const body = element.value
    if (body === note.body) return
    if (body.trim() === '' && note.body.trim() === '') {
      data.removeWithFeedback(note.id)
      return
    }
    data.savePatch(note, { body })
  }, [data])

  /** Capture via + / double-click: place at the given point (or centre), top layer, focused. */
  const addNote = useCallback(async (point?: { x: number; y: number }): Promise<void> => {
    if (creating) return
    if (trash.activeNotes.length >= MAX_ACTIVE_NOTES) {
      data.setActionError(t('wall.full'))
      return
    }
    const offset = (trash.activeNotes.length % 6) * 18
    const anchorX = point === undefined ? Math.max(0, (wallSize.width - NOTE_DEFAULT_WIDTH) / 2) + offset : point.x
    const anchorY = point === undefined ? Math.max(0, (wallSize.height - NOTE_DEFAULT_HEIGHT) / 2) + offset : point.y
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
      selectTab('notes')
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
  }, [createNote, creating, data, selectTab, t, trash, wallRef, wallSize.height, wallSize.width])

  const renderWall = (): ReactElement => (
    <div
      className="dsh-desk-wall"
      ref={setWallRef}
      onDoubleClick={(event) => {
        // Only empty wall space creates a note; double-clicking a sticker or control is ignored.
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        void addNote({
          x: event.clientX - rect.left - NOTE_DEFAULT_WIDTH / 2,
          y: event.clientY - rect.top - NOTE_DEFAULT_HEIGHT / 2,
        })
      }}
    >
      {data.loading
        ? <p className="dsh-desk-wall-hint">{t('state.loading')}</p>
        : trash.activeNotes.length === 0
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
          animating={trash.smashing || trash.trashingIds.has(item.note.id)}
          animationDelayMs={trash.smashing ? Math.min(index, 8) * 18 : 0}
          t={t}
          onRaise={raise}
          onDragStart={drag.startDrag}
          onResizeStart={drag.startResize}
          onColor={(note, color: NoteColor) => data.savePatch(note, { color })}
          onTrash={trash.trashNote}
          onBodyCommit={commitBody}
        />
      ))}
    </div>
  )

  const renderOverview = (): ReactElement => (
    // Overview content is not designed yet; keep it blank rather than piling unvalidated features.
    <div className="dsh-desk-overview" />
  )

  return (
    <div className="dsh-desk-page">
      <header className="dsh-desk-head" data-window-drag>
        <div>
          <h1 className="dsh-desk-title">{t('page.title')}</h1>
          <p className="dsh-desk-subtitle">{t('page.subtitle')}</p>
        </div>
      </header>
      <nav className="dsh-desk-tabs" role="tablist">
        <button type="button" className="dsh-desk-tab" data-active={tab === 'overview'} onClick={() => selectTab('overview')}>
          {t('tab.overview')}
        </button>
        <button type="button" className="dsh-desk-tab" data-active={tab === 'notes'} onClick={() => selectTab('notes')}>
          {t('tab.notes')}
        </button>
        <button type="button" className="dsh-desk-tab" data-active={tab === 'tasks'} onClick={() => selectTab('tasks')}>
          {t('tab.tasks')}
        </button>
      </nav>
      {data.loadError === null ? null : (
        <div>
          <p className="dsh-desk-error">{t('state.loadFailed', { message: data.loadError })}</p>
          <button type="button" className="dsh-desk-btn" onClick={() => { void data.reload() }}>{t('action.retry')}</button>
        </div>
      )}
      {data.actionError === null ? null : <p className="dsh-desk-error">{data.actionError}</p>}
      {tab === 'overview' ? renderOverview() : tab === 'notes' ? (
        <div className="dsh-desk-notesview">
          {trash.showTrash
            ? (
                <TrashPanel
                  trashedNotes={trash.trashedNotes}
                  visibleTrashed={trash.visibleTrashed}
                  trashVisible={trash.trashVisible}
                  confirmClearTrash={trash.confirmClearTrash}
                  t={t}
                  onLoadMore={trash.loadMoreTrash}
                  onClearTrash={trash.clearTrash}
                  onRestore={note => data.savePatch(note, { trashed: false })}
                  onDelete={data.removeWithFeedback}
                />
              )
            : renderWall()}
        </div>
      ) : (
        <TaskBoard
          t={t}
          listTasks={listTasks}
          createTask={createTask}
          updateTask={updateTask}
          deleteTask={deleteTask}
          listGroups={listGroups}
          createGroup={createGroup}
          updateGroup={updateGroup}
          moveGroup={moveGroup}
          deleteGroup={deleteGroup}
        />
      )}
      {tab === 'notes'
        ? (
            <WallActions
              showTrash={trash.showTrash}
              creating={creating}
              smashing={trash.smashing}
              confirmSmash={trash.confirmSmash}
              t={t}
              onAdd={() => { void addNote() }}
              onToggleTrash={trash.toggleTrash}
              onSmash={trash.smashWall}
            />
          )
        : null}
    </div>
  )
}

// Keep the translator type referenced so the exported composition stays self-documenting.
export type { DeskTranslator }
