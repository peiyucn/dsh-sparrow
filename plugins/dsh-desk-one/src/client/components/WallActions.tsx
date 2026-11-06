/**
 * Bottom action row: capture, trash view and Smash.
 *
 * Note: during the refactor this keeps the original order and tooltips; a follow-up commit
 * separates "wall actions" from "navigate to trash" and fixes the Smash confirm reset.
 */

import type { ReactElement } from 'react'
import type { DeskTranslator } from '../types.js'

interface WallActionsProps {
  readonly showTrash: boolean
  readonly creating: boolean
  readonly smashing: boolean
  readonly confirmSmash: boolean
  readonly t: DeskTranslator
  readonly onAdd: () => void
  readonly onToggleTrash: () => void
  readonly onSmash: () => void
}

export function WallActions({
  showTrash, creating, smashing, confirmSmash, t, onAdd, onToggleTrash, onSmash,
}: WallActionsProps): ReactElement {
  return (
    <div className="dsh-desk-fabstack">
      <div className="dsh-desk-fabrow">
        {showTrash
          ? null
          : (
              <button
                type="button"
                className="dsh-desk-add dsh-desk-fabglass"
                disabled={creating || smashing}
                aria-label={t('action.newNote')}
                title={t('action.newNote')}
                onClick={onAdd}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
        <button
          type="button"
          className="dsh-desk-fab-secondary dsh-desk-fabglass"
          aria-label={showTrash ? t('action.backToWall') : t('action.trash')}
          title={showTrash ? t('action.backToWall') : t('action.trash')}
          onClick={onToggleTrash}
        >
          {showTrash
            ? (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M11.5 5.5L7 10l4.5 4.5M7.5 10h7" />
              </svg>
            )
            : (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
              </svg>
            )}
        </button>
        {showTrash
          ? null
          : (
              <button
                type="button"
                className="dsh-desk-smash dsh-desk-fabglass"
                data-confirm={confirmSmash}
                disabled={smashing}
                aria-label={confirmSmash ? t('action.smashConfirm') : t('action.smash')}
                title={confirmSmash ? t('action.smashConfirm') : t('action.smash')}
                onClick={onSmash}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M10 2.6v3.1M10 14.3v3.1M2.6 10h3.1M14.3 10h3.1M4.8 4.8l2.2 2.2M13 13l2.2 2.2M15.2 4.8L13 7M7 13l-2.2 2.2" />
                  <circle cx="10" cy="10" r="2.1" />
                </svg>
              </button>
            )}
      </div>
    </div>
  )
}
