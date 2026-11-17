

import { useState } from 'react'
import type { ReactElement } from 'react'
import { Menu, MenuItemButton, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskLocaleKey } from '../i18n.js'
import { DeskGlyph } from '../brand.js'
import type { DeskTranslator, Tab } from './types.js'

interface AskEntry {
  readonly id: string

  readonly label: DeskLocaleKey

  readonly prompt: DeskLocaleKey
}

const ASK_ENTRIES: Readonly<Record<Tab, readonly AskEntry[]>> = {

  notes: [
    { id: 'note-merge', label: 'coauthor.menu.noteMerge', prompt: 'coauthor.prompt.noteMerge' },
    { id: 'note-to-task', label: 'coauthor.menu.noteToTask', prompt: 'coauthor.prompt.noteToTask' },
  ],

  tasks: [
    { id: 'task-from-schedule', label: 'coauthor.menu.taskFromSchedule', prompt: 'coauthor.prompt.taskFromSchedule' },
    { id: 'task-archive-done', label: 'coauthor.menu.taskArchiveDone', prompt: 'coauthor.prompt.taskArchiveDone' },
  ],

  notebook: [
    { id: 'notebook-highlights', label: 'coauthor.menu.notebookHighlights', prompt: 'coauthor.prompt.notebookHighlights' },
    { id: 'notebook-from-notes', label: 'coauthor.menu.notebookFromNotes', prompt: 'coauthor.prompt.notebookFromNotes' },
  ],

  schedule: [
    { id: 'schedule-today', label: 'coauthor.menu.scheduleToday', prompt: 'coauthor.prompt.scheduleToday' },
    { id: 'schedule-week', label: 'coauthor.menu.scheduleWeek', prompt: 'coauthor.prompt.scheduleWeek' },
  ],

  sessions: [
    { id: 'sessions-archive', label: 'coauthor.menu.sessionsArchive', prompt: 'coauthor.prompt.sessionsArchive' },
    { id: 'sessions-review', label: 'coauthor.menu.sessionsReview', prompt: 'coauthor.prompt.sessionsReview' },
  ],
}


export function DeskAskMenu({ t, tab, onAskDesk }: {
  readonly t: DeskTranslator
  readonly tab: Tab
  readonly onAskDesk: (prompt: string) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const entries = ASK_ENTRIES[tab]
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      align="start"


      portal
      anchor={(
        <button
          type="button"
          className="dsh-desk-brand-ask"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          <span className="dsh-desk-brand-ask-logo">
            <DeskGlyph size={14} />
            <span>{t('page.title')}</span>
          </span>
          <span className="dsh-desk-brand-ask-action">{t('coauthor.entry')}</span>
        </button>
      )}
    >
      {entries.map(entry => (


        <Tooltip
          key={entry.id}
          label={t(entry.prompt)}
          side="right"
          delayMs={400}
          focusDelayMs={600}
          maxWidth={360}
          portal
        >
          <div className="dsh-desk-ask-option">
            <MenuItemButton
              onSelect={() => {
                setOpen(false)
                onAskDesk(t(entry.prompt))
              }}
            >
              {t(entry.label)}
            </MenuItemButton>
          </div>
        </Tooltip>
      ))}
    </Menu>
  )
}
