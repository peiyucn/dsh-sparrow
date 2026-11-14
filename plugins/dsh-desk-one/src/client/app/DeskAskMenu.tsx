/**
 * Header brand control: the inverted 「✦」 Desk One lockup and the line-framed 「和我说」 segment are
 * one split button. Its menu is a short list of **sentences the user can send as-is** — each row is
 * a complete, scoped request ("帮我…") rather than an action label; picking one opens (or reuses) the
 * Workspace blank Session with that exact sentence prepended to the composer. It never sends, and at
 * most two rows per tab keeps the menu scannable.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import { Menu, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskLocaleKey } from '../i18n.js'
import { DeskGlyph } from '../brand.js'
import type { DeskTranslator, Tab } from './types.js'

interface AskEntry {
  readonly id: string
  /** One complete sentence: shown as the menu row and prefilled verbatim into the composer. */
  readonly text: DeskLocaleKey
}

const ASK_ENTRIES: Readonly<Record<Tab, readonly AskEntry[]>> = {
  // Notes: merge duplicate wording, then pick out notes that no longer matter.
  notes: [
    { id: 'note-clarify', text: 'coauthor.prompt.noteClarify' },
    { id: 'note-cleanup', text: 'coauthor.prompt.noteCleanup' },
  ],
  // Tasks: pull work in from the two sources that most often turn into tasks.
  tasks: [
    { id: 'task-from-schedule', text: 'coauthor.prompt.taskFromSchedule' },
    { id: 'task-from-notes', text: 'coauthor.prompt.taskFromNotes' },
  ],
  // Notebook: audit the library, then turn keeper notes into a page.
  notebook: [
    { id: 'notebook-audit', text: 'coauthor.prompt.notebookAudit' },
    { id: 'notebook-from-notes', text: 'coauthor.prompt.notebookFromNotes' },
  ],
  // Schedule is a read-only mirror: read-only questions only.
  schedule: [
    { id: 'schedule-today', text: 'coauthor.prompt.scheduleToday' },
    { id: 'schedule-week', text: 'coauthor.prompt.scheduleWeek' },
  ],
  // Session management is administrative: read-only analysis only.
  sessions: [
    { id: 'sessions-duplicates', text: 'coauthor.prompt.sessionsDuplicates' },
    { id: 'sessions-review', text: 'coauthor.prompt.sessionsReview' },
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
        <MenuItemButton
          key={entry.id}
          onSelect={() => {
            setOpen(false)
            onAskDesk(t(entry.text))
          }}
        >
          {t(entry.text)}
        </MenuItemButton>
      ))}
    </Menu>
  )
}
