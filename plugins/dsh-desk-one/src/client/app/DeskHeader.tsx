/**
 * Persistent panel header: official conversation-header geometry.
 *
 * Row 1: brand lockup (glyph + inverted wordmark) + one-line intro + info button, with the
 * active view's actions on the right. Row 2: official conversation-style plain text tabs.
 * The header is a fixed 76px overlay; feature views offset their first line below it.
 */

import type { ReactElement, ReactNode } from 'react'
import type { DeskTranslator, Tab } from './types.js'
import { OVERFLOW_TABS, VISIBLE_TABS } from './tabs.js'
import { DeskTabMenu } from './DeskTabMenu.js'
import { DeskIntroInfo } from './DeskIntroInfo.js'
import { DeskGlyph } from '../brand.js'

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
          <span className="dsh-desk-brand-mark" aria-hidden="true"><DeskGlyph size={14} /></span>
          <h1 className="dsh-desk-title">{t('page.title')}</h1>
          <p className="dsh-desk-intro">{t('page.subtitle')}</p>
          <DeskIntroInfo t={t} />
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
