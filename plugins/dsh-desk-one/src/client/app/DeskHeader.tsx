/**
 * Persistent panel header: official conversation-header geometry.
 *
 * Row 1: brand title + one-line intro, with the active view's actions on the right.
 * Row 2: official conversation-style plain text tabs (2px underline on the active tab).
 * The header is in normal flow and exactly reserves its height; feature views never sit
 * underneath it, so content and scrollbars always start below the header.
 */

import type { ReactElement, ReactNode } from 'react'
import type { DeskTranslator, Tab } from './types.js'
import { OVERFLOW_TABS, VISIBLE_TABS } from './tabs.js'
import { DeskTabMenu } from './DeskTabMenu.js'

interface DeskHeaderProps {
  readonly t: DeskTranslator
  readonly tab: Tab
  readonly onSelectTab: (tab: Tab) => void
  /** Active view actions; rendered on the title-row right edge. */
  readonly actions: ReactNode
}

export function DeskHeader({ t, tab, onSelectTab, actions }: DeskHeaderProps): ReactElement {
  return (
    <header className="dsh-desk-header" data-window-drag>
      <div className="dsh-desk-header-top">
        <div className="dsh-desk-brand">
          <h1 className="dsh-desk-title">{t('page.title')}</h1>
          <p className="dsh-desk-intro">{t('page.subtitle')}</p>
        </div>
        {actions === null ? null : (
          <div className="dsh-desk-header-actions" data-window-drag-recall>{actions}</div>
        )}
      </div>
      <nav className="dsh-desk-tabs">
        <div className="dsh-desk-viewtabs" role="tablist">
          {VISIBLE_TABS.map(entry => (
            <button
              key={entry.tab}
              type="button"
              className="dsh-desk-tab"
              data-active={tab === entry.tab}
              onClick={() => onSelectTab(entry.tab)}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
        <DeskTabMenu t={t} tab={tab} onSelectTab={onSelectTab} entries={OVERFLOW_TABS} />
      </nav>
    </header>
  )
}
