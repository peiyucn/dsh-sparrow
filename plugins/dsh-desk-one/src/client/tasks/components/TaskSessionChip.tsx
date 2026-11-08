/**
 * One linked-session chip on a task card, plus its in-place stats expansion.
 *
 * The chip is one interactive surface: clicking anywhere toggles the expansion; the remove and
 * enter controls stop propagation. Stats inherit the chip's neutral text color and its
 * running/idle tint, so the expanded box reads as the chip growing rather than a popup.
 */

import type { ReactElement } from 'react'
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

/** Human status label shared with the picker. */
export function sessionStatusText(t: DeskTranslator, chip: SessionChipInfo): string {
  if (chip.availability === 'available') return chip.running ? t('task.session.running') : t('task.session.idle')
  if (chip.availability === 'loading') return t('task.session.loading')
  if (chip.availability === 'archived') return t('task.session.archived')
  return t('task.session.unavailable')
}

/** Compact token count: 950, 12.3k, 1.2M. */
function formatTokens(total: number): string {
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}k`
  return String(total)
}

/** Compact wall time: 42s, 3m 12s, 1h 04m. */
function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

function lastRunText(t: DeskTranslator, chip: SessionChipInfo): string {
  if (chip.updatedAt <= 0) return t('task.session.preview.never')
  const minutes = Math.max(0, Math.floor((Date.now() - chip.updatedAt) / 60_000))
  if (minutes < 1) return t('task.session.preview.justNow')
  if (minutes < 60) return t('task.session.preview.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('task.session.preview.hoursAgo', { count: hours })
  return t('task.session.preview.daysAgo', { count: Math.floor(hours / 24) })
}

/** Total provider-reported tokens (input + output + cache read/write). */
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
  const tokenText = tokens.known ? formatTokens(tokens.total) : (loading ? reading : '—')
  const modelTimeText = chip.llmMs === undefined ? (loading ? reading : '—') : formatDuration(chip.llmMs)

  return (
    <span
      className="dsh-task-session"
      data-state={chip.availability === 'available' ? (chip.running ? 'running' : 'idle') : chip.availability}
      data-expanded={expanded ? 'true' : undefined}
      onClick={onToggle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="dsh-task-session-title"
        title={`${chip.title} · ${sessionStatusText(t, chip)}`}
      >
        {chip.title}
      </button>
      <button
        type="button"
        className="dsh-task-session-remove"
        aria-label={t('task.session.remove')}
        title={t('task.session.remove')}
        onClick={(event) => {
          event.stopPropagation()
          onUnlink()
        }}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l6 6M9 3L3 9" />
        </svg>
      </button>
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
                <button
                  type="button"
                  className="dsh-task-session-preview-enter"
                  disabled={chip.availability !== 'available'}
                  aria-label={t('task.session.preview.open')}
                  title={t('task.session.preview.open')}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen()
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5" />
                  </svg>
                </button>
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
