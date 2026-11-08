/**
 * dsh-desk-one main panel.
 *
 * This file is composition only: state lives in the hooks under `hooks/`, rendering in the
 * components under `components/`. The notes wall is a fixed-width, vertically infinite canvas;
 * the collection itself is capped (100 on the wall, 200 in the trash).
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
import { TaskBoard } from '../tasks/components/TaskBoard.js'
import { SessionsView } from '../sessions/SessionsView.js'
import { SortMenu } from '../tasks/components/SortMenu.js'
import { useSessionLinks } from '../tasks/hooks/useSessionLinks.js'
import { useGroupsData } from '../tasks/hooks/useGroupsData.js'
import { useTaskBoard } from '../tasks/hooks/useTaskBoard.js'
import { useTasksData } from '../tasks/hooks/useTasksData.js'
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
    listGroups, createGroup, updateGroup, moveGroup, archiveGroup, deleteGroup, sessionLink,
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
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { wallRef, setWallRef, wallSize, placed } = useWallLayout(tab === 'notes', trash.activeNotes)
  const drag = useNoteDrag({ wallSize, wallRef, canvasRef, setNotes: data.setNotes, savePatch: data.savePatch })

  // Task board data + state live here (not inside TaskBoard) so the top bar can own its view
  // actions: new task, sort mode and the archive toggle.
  const taskData = useTasksData(t, { listTasks, createTask, updateTask, deleteTask })
  const groupsData = useGroupsData(t, { listGroups, createGroup, updateGroup, moveGroup, archiveGroup, deleteGroup })
  const sessionSnapshot = useSessionLinks(sessionLink)
  const board = useTaskBoard({
    tasks: taskData.tasks,
    setTasks: taskData.setTasks,
    savePatch: taskData.savePatch,
    addTask: taskData.addTask,
    removeWithFeedback: taskData.removeWithFeedback,
    setActionError: taskData.setActionError,
    groups: groupsData.groups,
    createGroup: groupsData.createGroup,
    renameGroup: groupsData.renameGroup,
    setGroupOrders: groupsData.setGroupOrders,
    removeGroup: groupsData.removeGroup,
    moveGroupToLane: groupsData.moveGroupToLane,
    archiveGroup: groupsData.archiveGroup,
  })

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
    <div className="dsh-desk-wall" ref={setWallRef}>
      <div
        className="dsh-desk-wall-canvas"
        ref={canvasRef}
        onDoubleClick={(event) => {
          // Only empty canvas space creates a note; double-clicking a sticker or control is ignored.
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
            onColor={(note: DeskNote, color: NoteColor) => data.savePatch(note, { color })}
            onTrash={trash.trashNote}
            onBodyCommit={commitBody}
          />
        ))}
      </div>
    </div>
  )

  const renderOverview = (): ReactElement => (
    // Overview content is not designed yet; keep the page subtitle here rather than in the
    // navigation row, which must stay tight for the reserved time-management slot.
    <div className="dsh-desk-overview">
      <p className="dsh-desk-subtitle">{t('page.subtitle')}</p>
    </div>
  )

  const plusIcon = (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  )
  const backIcon = (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M11.5 5.5L7 10l4.5 4.5M7.5 10h7" />
    </svg>
  )
  const trashIcon = (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
    </svg>
  )
  const archiveIcon = (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M4 5.5h12v11H4zM3 3.5h14v2H3zM8 9h4" />
    </svg>
  )
  const smashIcon = (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M10 2.6v3.1M10 14.3v3.1M2.6 10h3.1M14.3 10h3.1M4.8 4.8l2.2 2.2M13 13l2.2 2.2M15.2 4.8L13 7M7 13l-2.2 2.2" />
      <circle cx="10" cy="10" r="2.1" />
    </svg>
  )

  /** Notes/trash actions float over the canvas so notes can scroll underneath them. */
  const notesActions = (): ReactElement => {
    if (trash.showTrash) {
      return (
        <>
          <button type="button" className="dsh-desk-action" aria-label={t('action.backToWall')} title={t('action.backToWall')} onClick={trash.toggleTrash}>
            {backIcon}
            <span className="dsh-desk-action-label">{t('action.backToWall')}</span>
          </button>
          <button
            type="button"
            className="dsh-desk-action"
            aria-label={trash.confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
            title={trash.confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
            data-danger={trash.confirmClearTrash ? 'true' : undefined}
            disabled={trash.trashedNotes.length === 0 || trash.smashing}
            onClick={trash.clearTrash}
          >
            {trashIcon}
            <span className="dsh-desk-action-label">
              {trash.confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
            </span>
          </button>
        </>
      )
    }
    return (
      <>
        <button
          type="button"
          className="dsh-desk-action dsh-desk-action-primary"
          aria-label={t('action.newNote')}
          title={t('action.newNote')}
          disabled={creating || trash.smashing}
          onClick={() => { void addNote() }}
        >
          {plusIcon}
          <span className="dsh-desk-action-label">{t('action.newNote')}</span>
        </button>
        <button
          type="button"
          className="dsh-desk-action"
          data-smash-confirm="true"
          aria-label={trash.confirmSmash ? t('action.smashConfirm') : t('action.smash')}
          title={trash.confirmSmash ? t('action.smashConfirm') : t('action.smash')}
          data-danger={trash.confirmSmash ? 'true' : undefined}
          disabled={trash.smashing}
          onClick={trash.smashWall}
        >
          {smashIcon}
          <span className="dsh-desk-action-label">
            {trash.confirmSmash ? t('action.smashConfirm') : t('action.smash')}
          </span>
        </button>
        <button type="button" className="dsh-desk-action" aria-label={t('trash.title')} title={t('trash.title')} onClick={trash.toggleTrash}>
          {trashIcon}
          <span className="dsh-desk-action-label">{t('trash.title')}</span>
        </button>
      </>
    )
  }

  /** Task actions stay in the chrome's second row (board layout is fixed height). */
  const taskActions = (): ReactElement | null => {
    if (tab !== 'tasks') return null
    if (board.showArchive) {
      return (
        <button type="button" className="dsh-desk-action" aria-label={t('task.backToBoard')} title={t('task.backToBoard')} onClick={board.toggleArchive}>
          {backIcon}
          <span className="dsh-desk-action-label">{t('task.backToBoard')}</span>
        </button>
      )
    }
    return (
      <>
        <button
          type="button"
          className="dsh-desk-action dsh-desk-action-primary"
          aria-label={t('task.add')}
          title={t('task.add')}
          onClick={() => board.beginDraft('todo')}
        >
          {plusIcon}
          <span className="dsh-desk-action-label">{t('task.add')}</span>
        </button>
        <SortMenu t={t} mode={board.sortMode} onChange={board.setSortMode} />
        <button type="button" className="dsh-desk-action" aria-label={t('task.archive')} title={t('task.archive')} onClick={board.toggleArchive}>
          {archiveIcon}
          <span className="dsh-desk-action-label">
            {t('task.archive')}{board.archivedTasks.length === 0 ? '' : ` (${board.archivedTasks.length})`}
          </span>
        </button>
      </>
    )
  }

  const actions = tab === 'notes' ? notesActions() : taskActions()

  return (
    <div className="dsh-desk-page">
      <header className="dsh-desk-chrome" data-window-drag>
        <div className="dsh-desk-chrome-inner">
          <div className="dsh-desk-chrome-top">
            <h1 className="dsh-desk-title">{t('page.title')}</h1>
            {actions === null ? null : (
              <div className="dsh-desk-header-actions" data-window-drag-recall>{actions}</div>
            )}
          </div>
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
            <button type="button" className="dsh-desk-tab" data-active={tab === 'sessions'} onClick={() => selectTab('sessions')}>
              {t('tab.sessions')}
            </button>
          </nav>
        </div>
      </header>
      <div className="dsh-desk-body">
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
                    <div className="dsh-desk-trash-host">
                      <TrashPanel
                        trashedNotes={trash.trashedNotes}
                        visibleTrashed={trash.visibleTrashed}
                        trashVisible={trash.trashVisible}
                        t={t}
                        onLoadMore={trash.loadMoreTrash}
                        onRestore={note => data.savePatch(note, { trashed: false })}
                        onDelete={data.removeWithFeedback}
                      />
                    </div>
                  )
                : renderWall()}
            </div>
          ) : tab === 'sessions' ? (
            <SessionsView snapshot={sessionSnapshot} t={t} onOpen={sessionLink.open} />
          ) : (
            <TaskBoard
              t={t}
              data={taskData}
              groupsData={groupsData}
              board={board}
              sessionLink={sessionLink}
            />
          )}
      </div>
    </div>
  )
}

// Keep the translator type referenced so the exported composition stays self-documenting.
export type { DeskTranslator }
