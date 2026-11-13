/**
 * Persistent panel header: official conversation-header geometry.
 *
 * Row 1: brand lockup (glyph + inverted wordmark) + one-line intro + info button, with the
 * active view's actions on the right. Row 2: official conversation-style plain text tabs, each
 * with the same glyph the optional left-rail entry uses, plus a pin toggle for the current tab.
 * The header is a fixed 76px overlay; feature views offset their first line below it.
 */

import type { ReactElement, ReactNode } from 'react'
import { IconPinFillRegular, IconPinOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator, Tab } from './types.js'
import { OVERFLOW_TABS, VISIBLE_TABS } from './tabs.js'
import { DeskTabMenu } from './DeskTabMenu.js'
import { DeskIntroInfo } from './DeskIntroInfo.js'
import { DeskTabGlyph } from '../tabIcons.js'
import { DeskGlyph } from '../brand.js'

interface DeskHeaderProps {
  readonly t: DeskTranslator
  readonly tab: Tab
  readonly onSelectTab: (tab: Tab) => void
  /** Whether the current tab has its own left-rail entry. */
  readonly pinned: boolean
  /** Pin / unpin the current tab's left-rail entry (dynamic, persisted). */
  readonly onTogglePin: () => void
  /** Active view actions; rendered on the title-row right edge. */
  readonly actions: ReactNode
}

export function DeskHeader({ t, tab, onSelectTab, pinned, onTogglePin, actions }: DeskHeaderProps): ReactElement {
  const pinLabel = pinned ? t('tab.unpin') : t('tab.pin')
  return (
    <header className="dsh-desk-header" data-window-drag>
      <div className="dsh-desk-header-top">
        <div className="dsh-desk-brand">
          <h1 className="dsh-desk-title">
            <span className="dsh-desk-brand-mark" aria-hidden="true"><DeskGlyph size={14} /></span>
            <span>{t('page.title')}</span>
          </h1>
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
              <DeskTabGlyph tab={entry.tab} />
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
        <DeskTabMenu t={t} tab={tab} onSelectTab={onSelectTab} entries={OVERFLOW_TABS} />
        <Tooltip label={pinLabel} side="bottom" delayMs={300}>
          <button
            type="button"
            className="dsh-desk-pin"
            data-pinned={pinned}
            aria-label={pinLabel}
            aria-pressed={pinned}
            onClick={onTogglePin}
          >
            {pinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />}
          </button>
        </Tooltip>
      </nav>
    </header>
  )
}
