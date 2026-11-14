/**
 * dsh-desk-one main panel.
 *
 * This file is composition only: state lives in the hooks under `hooks/`, rendering in the
 * components under `components/` and in each feature's folder. The notes wall's own behavior lives
 * in `client/notes/` (`useNoteWall` + `NotesWall`); this shell only switches tabs and wires the
 * shared header actions.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE, TAB_STORAGE_KEY } from '../../constants.js'
import { notesActions, scheduleActions, taskActions } from './headerActions.js'
import { NotesWall } from '../notes/NotesWall.js'
import { useNoteWall } from '../notes/useNoteWall.js'
import { TrashPanel } from '../notes/components/TrashPanel.js'
import { useNoteDrag } from '../notes/hooks/useNoteDrag.js'
import { useNotesData } from '../notes/hooks/useNotesData.js'
import { useTrash } from '../notes/hooks/useTrash.js'
import { useWallLayout } from '../notes/hooks/useWallLayout.js'
import { AnnotationLanding } from '../notebook/landing/AnnotationLanding.js'
import { TaskBoard } from '../tasks/components/TaskBoard.js'
import { SessionsView } from '../sessions/SessionsView.js'
import { ScheduleView, type ScheduleHeaderActions } from '../schedule/ScheduleView.js'
import { useSessionLinks } from '../tasks/hooks/useSessionLinks.js'
import { useGroupsData } from '../tasks/hooks/useGroupsData.js'
import { useTaskBoard } from '../tasks/hooks/useTaskBoard.js'
import { useTasksData } from '../tasks/hooks/useTasksData.js'
import type { DeskPanelInjected } from '../install.js'
import type { DeskTranslator, Tab } from './types.js'
import { DeskHeader } from './DeskHeader.js'
import { readInitialTab } from './utils.js'
import { subscribePanelReset } from './panelReset.js'

/** Page props: main-panel owner share + injected actions + locale seat (assembled by the host). */
type DeskPanelProps = PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

export function DeskOnePage(props: DeskPanelProps) {
  const {
    listNotes, updateNote, deleteNote, createNote, t,
    listTasks, createTask, updateTask, deleteTask,
    listGroups, createGroup, updateGroup, moveGroup, archiveGroup, deleteGroup, sessionLink, sessionsArchive, schedule,
    notebook, workspaceAccess, openReview, openBrowser, startWithPrompt, initialTab, pin,
  } = props
  // A left-rail entry opens its own tab; the base entry (no initialTab) resumes the last visited tab.
  const [tab, setTab] = useState<Tab>(() => initialTab ?? readInitialTab())
  const scheduleActionsRef = useRef<ScheduleHeaderActions | null>(null)
  const [onSourcesPage, setOnSourcesPage] = useState(false)
  const [scheduleIssues, setScheduleIssues] = useState(0)

  const [pinnedHere, setPinnedHere] = useState<boolean>(() => pin.isPinned(tab))

  // A pinned tab entry is part of the left rail only while its tab is pinned; keep the header
  // toggle in sync when the tab changes (the base entry can switch tabs in place).
  useEffect(() => {
    setPinnedHere(pin.isPinned(tab))
  }, [pin, tab])

  const togglePinned = useCallback((): void => {
    const next = !pin.isPinned(tab)
    pin.setPinned(tab, next)
    setPinnedHere(next)
  }, [pin, tab])

  const selectTab = useCallback((next: Tab): void => {
    setTab(next)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next)
    } catch {
      // Storage unavailable (private mode): keep the choice for this session only.
    }
  }, [])

  /** "和 DSH 一起": put one prompt into the Workspace blank's composer (never sends). */
  const askDesk = useCallback((prompt: string): void => {
    startWithPrompt(prompt)
  }, [startWithPrompt])

  // Pinned left-rail entries own exactly one tab. Clicking such a row while this panel is already
  // active produces no store notification (same panel id), so the click arrives through the
  // out-of-band bridge and returns the panel's strip to its entry tab instead of looking dead.
  useEffect(() => {
    if (initialTab === undefined) return undefined
    return subscribePanelReset(requested => {
      if (requested === initialTab) setTab(initialTab)
    })
  }, [initialTab])

  // Notes wall: data, trash, geometry … and the wall's own behavior (create / raise / commit).
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
  const wall = useNoteWall({
    t,
    data,
    trash,
    wallRef,
    wallSize,
    selectNotesTab: () => selectTab('notes'),
    createNote,
  })

  // Task board data + state live here (not inside TaskBoard) so the shared header can own the
  // view actions: new task, sort mode and the archive toggle.
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

  const actions = tab === 'notes'
    ? notesActions({
        t,
        showTrash: trash.showTrash,
        toggleTrash: trash.toggleTrash,
        confirmClearTrash: trash.confirmClearTrash,
        clearTrash: trash.clearTrash,
        trashedCount: trash.trashedNotes.length,
        smashing: trash.smashing,
        confirmSmash: trash.confirmSmash,
        smashWall: trash.smashWall,
        creating: wall.creating,
        addNote: () => { void wall.addNote() },
      })
    : tab === 'tasks'
      ? taskActions({
          t,
          visible: tab === 'tasks',
          showArchive: board.showArchive,
          toggleArchive: board.toggleArchive,
          beginDraft: () => board.beginDraft('todo'),
          sortMode: board.sortMode,
          setTaskSortMode: board.setSortMode,
          archivedCount: board.archivedTasks.length,
        })
      // The annotation landing page owns its primary action in the body, like an empty state;
      // the shared header keeps no actions for this tab.
      : tab === 'notebook'
        ? null
        : scheduleActions({
            t,
            visible: tab === 'schedule',
            onSourcesPage,
            issueCount: scheduleIssues,
            backToCalendar: () => scheduleActionsRef.current?.backToCalendar(),
            openSources: () => scheduleActionsRef.current?.openSources(),
          })

  return (
    <div className="dsh-desk-page">
      <DeskHeader t={t} tab={tab} onSelectTab={selectTab} pinned={pinnedHere} onTogglePin={togglePinned} actions={actions} onAskDesk={askDesk} onWish={() => askDesk(t('coauthor.prompt.wish'))} />
      <div className="dsh-desk-body">
        {data.loadError === null ? null : (
          <div>
            <p className="dsh-desk-error">{t('state.loadFailed', { message: data.loadError })}</p>
            <button type="button" className="dsh-desk-btn" onClick={() => { void data.reload() }}>{t('action.retry')}</button>
          </div>
        )}
        {data.actionError === null ? null : <p className="dsh-desk-error">{data.actionError}</p>}
        {tab === 'notebook' ? (
            <AnnotationLanding
              t={t}
              notebook={notebook}
              workspaceAccess={workspaceAccess}
              onOpenReview={openReview}
              onOpenBrowser={openBrowser}
            />
          ) : tab === 'notes' ? (
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
                : (
                    <NotesWall
                      t={t}
                      setWallRef={setWallRef}
                      canvasRef={canvasRef}
                      placed={placed}
                      loading={data.loading}
                      empty={trash.activeNotes.length === 0}
                      animating={trash.smashing}
                      trashingIds={trash.trashingIds}
                      onAddAt={(point) => { void wall.addNote(point) }}
                      onRaise={wall.raise}
                      onDragStart={drag.startDrag}
                      onResizeStart={drag.startResize}
                      onColor={(note, color) => data.savePatch(note, { color })}
                      onTrash={trash.trashNote}
                      onBodyCommit={wall.commitBody}
                      onAskDesk={() => askDesk(t('coauthor.prompt.noteAdd'))}
                    />
                  )}
            </div>
          ) : tab === 'schedule' ? (
            <ScheduleView
              t={t}
              api={schedule}
              headerActionsRef={scheduleActionsRef}
              onPageChange={setOnSourcesPage}
              onHealthChange={setScheduleIssues}
              todayContext={{
                notesCount: trash.activeNotes.length,
                openTasks: taskData.tasks.filter(task => task.status !== 'done' && !task.archived).length,
                activeSessions: sessionSnapshot.sessions.filter(session => session.availability !== 'archived').length,
                onAddNote: () => { selectTab('notes'); void wall.addNote() },
                onAddTask: () => { selectTab('tasks'); board.beginDraft('todo') },
                onOpenNotes: () => selectTab('notes'),
                onOpenNotebook: () => selectTab('notebook'),
                onOpenTasks: () => selectTab('tasks'),
                onOpenSessions: () => selectTab('sessions'),
              }}
            />
          ) : tab === 'sessions' ? (
            <SessionsView snapshot={sessionSnapshot} t={t} onOpen={sessionLink.open} archive={sessionsArchive} />
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
