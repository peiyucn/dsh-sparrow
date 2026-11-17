

import type { ReactElement } from 'react'
import { ActionTooltip } from '../../app/ActionTooltip.js'
import { formatDuration, formatTokenCount, relativeTimeOf } from '../../app/utils.js'
import type { DeskTranslator } from '../../app/types.js'
import type { SessionChipInfo } from '../../sessions/contract.js'

interface TaskSessionChipProps {
  readonly chip: SessionChipInfo
  readonly t: DeskTranslator
  readonly expanded: boolean
  readonly loading: boolean
  readonly onToggle: () => void
  readonly onOpen: () => void
  readonly onUnlink: () => void
}


export function sessionStatusText(t: DeskTranslator, chip: SessionChipInfo): string {
  if (chip.availability === 'available') return chip.running ? t('task.session.running') : t('task.session.idle')
  if (chip.availability === 'loading') return t('task.session.loading')
  if (chip.availability === 'archived') return t('task.session.archived')
  return t('task.session.unavailable')
}


function lastRunText(t: DeskTranslator, chip: SessionChipInfo): string {
  const age = relativeTimeOf(chip.updatedAt)
  switch (age.unit) {
    case 'never': return t('task.session.preview.never')
    case 'now': return t('task.session.preview.justNow')
    case 'minutes': return t('task.session.preview.minutesAgo', { count: age.count })
    case 'hours': return t('task.session.preview.hoursAgo', { count: age.count })
    case 'days': return t('task.session.preview.daysAgo', { count: age.count })
  }
}


function tokenTotalOf(chip: SessionChipInfo): { readonly known: boolean; readonly total: number } {
  const values = [chip.inputTokens, chip.outputTokens, chip.cacheReadTokens, chip.cacheWriteTokens]
    .filter((value): value is number => typeof value === 'number')
  return { known: values.length > 0, total: values.reduce((sum, value) => sum + value, 0) }
}

export function TaskSessionChip({
  chip, t, expanded, loading, onToggle, onOpen, onUnlink,
}: TaskSessionChipProps): ReactElement {
  const tokens = tokenTotalOf(chip)
  const reading = t('task.session.preview.reading')
  const tokenText = tokens.known ? formatTokenCount(tokens.total) : (loading ? reading : '—')
  const modelTimeText = chip.llmMs === undefined ? (loading ? reading : '—') : formatDuration(chip.llmMs)

  return (
    <span
      className="dsh-task-session"
      data-state={chip.availability === 'available' ? (chip.running ? 'running' : 'idle') : chip.availability}
      data-expanded={expanded ? 'true' : undefined}
      onClick={onToggle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ActionTooltip label={`${chip.title} · ${sessionStatusText(t, chip)}`}>
        <button
          type="button"
          className="dsh-task-session-title"
        >
          {chip.title}
        </button>
      </ActionTooltip>
      <ActionTooltip label={t('task.session.remove')}>
        <button
          type="button"
          className="dsh-task-session-remove"
          aria-label={t('task.session.remove')}
          onClick={(event) => {
            event.stopPropagation()
            onUnlink()
          }}
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l6 6M9 3L3 9" />
          </svg>
        </button>
      </ActionTooltip>
      {expanded
        ? (
            <span className="dsh-task-session-preview">
              <span className="dsh-task-session-preview-head">
                <span
                  className="dsh-task-session-preview-token"
                  title={tokens.known
                    ? `in ${chip.inputTokens ?? 0} / out ${chip.outputTokens ?? 0} / cache read ${chip.cacheReadTokens ?? 0} / cache write ${chip.cacheWriteTokens ?? 0}`
                    : undefined}
                >
                  <span className="dsh-task-session-preview-label">{t('task.session.preview.tokens')}</span>
                  <b>{tokenText}</b>
                </span>
                <ActionTooltip label={t('task.session.preview.open')}>
                  <button
                    type="button"
                    className="dsh-task-session-preview-enter"
                    disabled={chip.availability !== 'available'}
                    aria-label={t('task.session.preview.open')}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen()
                    }}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5" />
                    </svg>
                  </button>
                </ActionTooltip>
              </span>
              <span className="dsh-task-session-preview-grid">
                <span className="dsh-task-session-preview-stat">
                  <span className="dsh-task-session-preview-label">{t('task.session.preview.lastRun')}</span>
                  <b>{lastRunText(t, chip)}</b>
                </span>
                <span className="dsh-task-session-preview-stat">
                  <span className="dsh-task-session-preview-label">{t('task.session.preview.modelTime')}</span>
                  <b>{modelTimeText}</b>
                </span>
                <span className="dsh-task-session-preview-stat">
                  <span className="dsh-task-session-preview-label">{t('task.session.preview.turns')}</span>
                  <b>{chip.turns ?? (loading ? reading : '—')}</b>
                </span>
                <span className="dsh-task-session-preview-stat">
                  <span className="dsh-task-session-preview-label">{t('task.session.preview.steps')}</span>
                  <b>{chip.steps ?? (loading ? reading : '—')}</b>
                </span>
              </span>
            </span>
          )
        : null}
    </span>
  )
}
