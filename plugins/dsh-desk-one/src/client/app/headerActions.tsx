/**
 * Panel header actions: one builder per tab, kept out of DeskOnePage so the page stays
 * composition-only. Every dependency is passed explicitly -- no hidden state.
 */

import type { ReactElement } from 'react'
import type { DeskTranslator } from './types.js'
import { archiveIcon, backIcon, plusIcon, smashIcon, sourcesIcon, trashIcon } from './icons.js'
import { SortMenu } from '../tasks/components/SortMenu.js'
import type { TaskSortMode } from '../tasks/types.js'

/** Notes tab: normal wall actions, or the trash sub-page pair. */
export function notesActions(props: {
  readonly t: DeskTranslator
  readonly showTrash: boolean
  readonly toggleTrash: () => void
  readonly confirmClearTrash: boolean
  readonly clearTrash: () => void
  readonly trashedCount: number
  readonly smashing: boolean
  readonly confirmSmash: boolean
  readonly smashWall: () => void
  readonly creating: boolean
  readonly addNote: () => void
}): ReactElement {
  const { t } = props
  if (props.showTrash) {
    return (
      <>
        <button key="back" type="button" className="dsh-desk-action" aria-label={t('action.backToWall')} title={t('action.backToWall')} onClick={props.toggleTrash}>
          {backIcon}
          <span className="dsh-desk-action-label">{t('action.backToWall')}</span>
        </button>
        <button
          key="clear"
          type="button"
          className="dsh-desk-action"
          aria-label={props.confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
          title={props.confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
          data-clear-trash-confirm="true"
          data-danger={props.confirmClearTrash ? 'true' : undefined}
          data-stable-width="true"
          disabled={props.trashedCount === 0 || props.smashing}
          onClick={props.clearTrash}
        >
          {trashIcon}
          <span className="dsh-desk-action-label">
            {props.confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
          </span>
        </button>
      </>
    )
  }
  return (
    <>
      <button
        key="capture"
        type="button"
        className="dsh-desk-action dsh-desk-action-primary"
        aria-label={t('action.newNote')}
        title={t('action.newNote')}
        disabled={props.creating || props.smashing}
        onClick={props.addNote}
      >
        {plusIcon}
        <span className="dsh-desk-action-label">{t('action.newNote')}</span>
      </button>
      <button
        key="smash"
        type="button"
        className="dsh-desk-action"
        data-smash-confirm="true"
        aria-label={props.confirmSmash ? t('action.smashConfirm') : t('action.smash')}
        title={props.confirmSmash ? t('action.smashConfirm') : t('action.smash')}
        data-danger={props.confirmSmash ? 'true' : undefined}
        disabled={props.smashing}
        onClick={props.smashWall}
      >
        {smashIcon}
        <span className="dsh-desk-action-label">
          {props.confirmSmash ? t('action.smashConfirm') : t('action.smash')}
        </span>
      </button>
      <button key="open-trash" type="button" className="dsh-desk-action" aria-label={t('trash.title')} title={t('trash.title')} onClick={props.toggleTrash}>
        {trashIcon}
        <span className="dsh-desk-action-label">{t('trash.title')}</span>
      </button>
    </>
  )
}

/** Tasks tab: board actions, or the single back button while the archive sub-page is open. */
export function taskActions(props: {
  readonly t: DeskTranslator
  readonly visible: boolean
  readonly showArchive: boolean
  readonly toggleArchive: () => void
  readonly beginDraft: () => void
  readonly sortMode: TaskSortMode
  readonly setTaskSortMode: (mode: TaskSortMode) => void
  readonly archivedCount: number
}): ReactElement | null {
  const { t } = props
  if (!props.visible) return null
  if (props.showArchive) {
    return (
      <button key="task-back" type="button" className="dsh-desk-action" aria-label={t('task.backToBoard')} title={t('task.backToBoard')} onClick={props.toggleArchive}>
        {backIcon}
        <span className="dsh-desk-action-label">{t('task.backToBoard')}</span>
      </button>
    )
  }
  return (
    <>
      <button
        key="task-add"
        type="button"
        className="dsh-desk-action dsh-desk-action-primary"
        aria-label={t('task.add')}
        title={t('task.add')}
        onClick={props.beginDraft}
      >
        {plusIcon}
        <span className="dsh-desk-action-label">{t('task.add')}</span>
      </button>
      <SortMenu key="task-sort" t={t} mode={props.sortMode} onChange={props.setTaskSortMode} />
      <button key="task-archive" type="button" className="dsh-desk-action" aria-label={t('task.archive')} title={t('task.archive')} onClick={props.toggleArchive}>
        {archiveIcon}
        <span className="dsh-desk-action-label">
          {t('task.archive')}{props.archivedCount === 0 ? '' : ` (${props.archivedCount})`}
        </span>
      </button>
    </>
  )
}

/** Schedule tab: settings entry, or the back button while the calendar-settings page is open. */
export function scheduleActions(props: {
  readonly t: DeskTranslator
  readonly visible: boolean
  readonly onSourcesPage: boolean
  readonly backToCalendar: () => void
  readonly openSources: () => void
}): ReactElement | null {
  const { t } = props
  if (!props.visible) return null
  if (props.onSourcesPage) {
    return (
      <button key="schedule-back" type="button" className="dsh-desk-action" aria-label={t('schedule.back')} title={t('schedule.back')} onClick={props.backToCalendar}>
        {backIcon}
        <span className="dsh-desk-action-label">{t('schedule.back')}</span>
      </button>
    )
  }
  return (
    <button key="schedule-sources" type="button" className="dsh-desk-action" onClick={props.openSources}>
      {sourcesIcon}
      <span className="dsh-desk-action-label">{t('schedule.sources')}</span>
    </button>
  )
}
