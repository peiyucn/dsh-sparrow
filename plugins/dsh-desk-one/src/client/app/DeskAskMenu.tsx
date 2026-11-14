/**
 * Header brand control: the inverted 「✦」 Desk One lockup and the line-framed 「和我说」 segment are
 * one split button. Its menu rows are **short human phrases** (what you'd say out loud); picking one
 * opens (or reuses) the Workspace blank Session and prefills the matching complete request — the
 * visible phrase is the label, the hidden half carries the scope and boundaries. It never sends, and
 * at most two rows per tab keeps the menu scannable.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import { Menu, MenuItemButton, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskLocaleKey } from '../i18n.js'
import { DeskGlyph } from '../brand.js'
import type { DeskTranslator, Tab } from './types.js'

interface AskEntry {
  readonly id: string
  /** Short human phrase shown as the menu row. */
  readonly label: DeskLocaleKey
  /** Complete request prefilled into the composer; may carry scope and boundaries. */
  readonly prompt: DeskLocaleKey
}

const ASK_ENTRIES: Readonly<Record<Tab, readonly AskEntry[]>> = {
  // Notes: deduplicate wording, or promote the follow-ups into tasks.
  notes: [
    { id: 'note-merge', label: 'coauthor.menu.noteMerge', prompt: 'coauthor.prompt.noteMerge' },
    { id: 'note-to-task', label: 'coauthor.menu.noteToTask', prompt: 'coauthor.prompt.noteToTask' },
  ],
  // Tasks: pull work in from the two sources that most often turn into tasks.
  tasks: [
    { id: 'task-from-schedule', label: 'coauthor.menu.taskFromSchedule', prompt: 'coauthor.prompt.taskFromSchedule' },
    { id: 'task-from-notes', label: 'coauthor.menu.taskFromNotes', prompt: 'coauthor.prompt.taskFromNotes' },
  ],
  // Notebook: surface this week's high-value pages, or turn keeper notes into a page.
  notebook: [
    { id: 'notebook-highlights', label: 'coauthor.menu.notebookHighlights', prompt: 'coauthor.prompt.notebookHighlights' },
    { id: 'notebook-from-notes', label: 'coauthor.menu.notebookFromNotes', prompt: 'coauthor.prompt.notebookFromNotes' },
  ],
  // Schedule is a read-only mirror: read-only questions only.
  schedule: [
    { id: 'schedule-today', label: 'coauthor.menu.scheduleToday', prompt: 'coauthor.prompt.scheduleToday' },
    { id: 'schedule-week', label: 'coauthor.menu.scheduleWeek', prompt: 'coauthor.prompt.scheduleWeek' },
  ],
  // Session management is administrative: read-only analysis only.
  sessions: [
    { id: 'sessions-archive', label: 'coauthor.menu.sessionsArchive', prompt: 'coauthor.prompt.sessionsArchive' },
    { id: 'sessions-review', label: 'coauthor.menu.sessionsReview', prompt: 'coauthor.prompt.sessionsReview' },
  ],
}

/** Brand split button + the tab-aware "things you can say" menu. */
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
      // The header clips its content (`overflow: hidden`), so the list must render under
      // document.body with CSS anchor positioning instead of in place.
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
        // Hovering (or focusing) a short menu row reveals the hidden prefill in a tooltip, so the
        // user can read exactly what the click will put into the composer before choosing it.
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
