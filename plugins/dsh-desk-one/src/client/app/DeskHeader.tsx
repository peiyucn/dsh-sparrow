/**
 * Persistent panel header: official conversation-header geometry.
 *
 * Row 1: brand lockup (glyph + inverted wordmark) + one-line intro + info button, with the
 * active view's actions on the right. Row 2: official conversation-style plain text tabs, each
 * with the same glyph the optional left-rail entry uses; the row ends with a quiet text action
 * that adds the current tab to the left rail (or removes it again).
 * The header is a fixed 76px overlay; feature views offset their first line below it.
 */

import type { ReactElement, ReactNode } from 'react'
import { IconPinFillRegular, IconPinOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator, Tab } from './types.js'
import { OVERFLOW_TABS, VISIBLE_TABS } from './tabs.js'
import { DeskTabMenu } from './DeskTabMenu.js'
import { DeskIntroInfo } from './DeskIntroInfo.js'
import { DeskAskMenu } from './DeskAskMenu.js'
import { DeskTabGlyph } from '../tabIcons.js'
import { DeskGlyph } from '../brand.js'

interface DeskHeaderProps {
  readonly t: DeskTranslator
  readonly tab: Tab
  readonly onSelectTab: (tab: Tab) => void
  /** Whether the current tab has its own left-rail entry. */
  readonly pinned: boolean
  /** Add the current tab to the left rail, or remove it again (dynamic, persisted). */
  readonly onTogglePin: () => void
  /** Active view actions; rendered on the title-row right edge. */
  readonly actions: ReactNode
  /** Open the Workspace blank with one prefilled prompt ("和 DSH 一起", never sends). */
  readonly onAskDesk: (prompt: string) => void
}

export function DeskHeader({ t, tab, onSelectTab, pinned, onTogglePin, actions, onAskDesk }: DeskHeaderProps): ReactElement {
  const shortcutLabel = pinned ? t('tab.unpin') : t('tab.pin')
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
          <DeskAskMenu t={t} tab={tab} onAskDesk={onAskDesk} />
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
        <button
          type="button"
          className="dsh-desk-shortcut"
          aria-label={shortcutLabel}
          aria-pressed={pinned}
          data-pinned={pinned}
          title={shortcutLabel}
          onClick={onTogglePin}
        >
          {pinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />}
          <span>{shortcutLabel}</span>
        </button>
      </nav>
    </header>
  )
}
