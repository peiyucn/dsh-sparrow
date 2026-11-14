/**
 * Header brand control: the inverted 「✦」 Desk One lockup and the line-framed 「和我说」 segment are
 * one split button, and its menu offers two prefilled prompts for the tab the user is looking at.
 * Picking one opens (or reuses) the Workspace blank Session with that prompt appended to the
 * composer — it never sends. The split keeps the brand mark unchanged on the left while the right
 * half advertises the conversation entry; at most two entries per tab keeps the menu scannable.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import { Menu, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
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
    { id: 'note-add', label: 'coauthor.menu.noteAdd', prompt: 'coauthor.prompt.noteAdd' },
    { id: 'note-tidy', label: 'coauthor.menu.noteTidy', prompt: 'coauthor.prompt.noteTidy' },
  ],
  tasks: [
    { id: 'task-add', label: 'coauthor.menu.taskAdd', prompt: 'coauthor.prompt.taskAdd' },
    { id: 'task-plan', label: 'coauthor.menu.taskPlan', prompt: 'coauthor.prompt.taskPlan' },
  ],
  notebook: [
    { id: 'notebook-new', label: 'coauthor.menu.notebookNew', prompt: 'coauthor.prompt.notebookNew' },
    { id: 'notebook-browse', label: 'coauthor.menu.notebookBrowse', prompt: 'coauthor.prompt.notebookBrowse' },
  ],
  // Schedule is a read-only mirror: it contributes read-only prompts only.
  schedule: [
    { id: 'schedule-today', label: 'coauthor.menu.scheduleToday', prompt: 'coauthor.prompt.scheduleToday' },
    { id: 'schedule-upcoming', label: 'coauthor.menu.scheduleUpcoming', prompt: 'coauthor.prompt.scheduleUpcoming' },
  ],
  // Session management is administrative: one tidy-up prompt, no creation entry.
  sessions: [
    { id: 'sessions-tidy', label: 'coauthor.menu.sessionsTidy', prompt: 'coauthor.prompt.sessionsTidy' },
  ],
}

/** Brand split button + the "和 DSH 一起" prompt menu of the active tab. */
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
            onAskDesk(t(entry.prompt))
          }}
        >
          {t(entry.label)}
        </MenuItemButton>
      ))}
    </Menu>
  )
}
