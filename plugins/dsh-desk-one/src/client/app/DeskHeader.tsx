

import type { ReactElement, ReactNode } from 'react'
import { IconPinFillRegular, IconPinOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator, Tab } from './types.js'
import { OVERFLOW_TABS, VISIBLE_TABS } from './tabs.js'
import { DeskTabMenu } from './DeskTabMenu.js'
import { DeskIntroInfo } from './DeskIntroInfo.js'
import { DeskAskMenu } from './DeskAskMenu.js'
import { DeskTabGlyph } from '../tabIcons.js'

interface DeskHeaderProps {
  readonly t: DeskTranslator
  readonly tab: Tab
  readonly onSelectTab: (tab: Tab) => void

  readonly pinned: boolean

  readonly onTogglePin: () => void

  readonly actions: ReactNode

  readonly onAskDesk: (prompt: string) => void

  readonly onWish: () => void
}

export function DeskHeader({ t, tab, onSelectTab, pinned, onTogglePin, actions, onAskDesk, onWish }: DeskHeaderProps): ReactElement {
  const shortcutLabel = pinned ? t('tab.unpin') : t('tab.pin')
  return (
    <header className="dsh-desk-header" data-window-drag>
      <div className="dsh-desk-header-top">
        <div className="dsh-desk-brand">
          <h1 className="dsh-desk-brand-heading">
            <DeskAskMenu t={t} tab={tab} onAskDesk={onAskDesk} />
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
        <DeskTabMenu t={t} tab={tab} onSelectTab={onSelectTab} entries={OVERFLOW_TABS} onWish={onWish} />
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
