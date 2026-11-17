

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { BusyDot } from './BusyDot.js'
import { formatCredits, formatModelFacts } from './format.js'
import { PROFILE_URL, safeExternalHref } from './external-links.js'
import type { ModelFactView } from './model-facts.js'
import { CCB_CLASS } from './styles.js'
import type { QuotaView, StatusPayload } from './use-credits-status.js'

const PANEL_MAX_WIDTH = 300
const PANEL_EDGE_GAP = 8

export interface PanelPoint {
  top: number
  right: number
  width: number
}


function formatReset(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const match = /^(\d{4}-\d{2}-\d{2}) 00:00:00$/u.exec(raw)
  return match === null ? raw : match[1]
}

function daysUntil(date: string): number | null {
  const time = Date.parse(date.replace(' ', 'T'))
  if (Number.isNaN(time)) return null
  const days = Math.ceil((time - Date.now()) / 86_400_000)
  return days >= 1 ? days : null
}


function percentText(ratio: number): string {
  const percent = ratio * 100
  return percent < 1 ? percent.toFixed(3) : String(Math.round(percent))
}


export function usePanelPoint(
  rootRef: RefObject<HTMLElement>,
  open: boolean,
  onClose: () => void,
): PanelPoint | null {
  const [point, setPoint] = useState<PanelPoint | null>(null)


  const position = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    const conversationLeft = document.querySelector('[data-conversation-scroll]')?.getBoundingClientRect().left ?? 0
    const width = Math.min(PANEL_MAX_WIDTH, Math.max(0, rect.right - conversationLeft - PANEL_EDGE_GAP))
    setPoint({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
      width,
    })
  }, [rootRef])


  useLayoutEffect(() => {
    if (!open) return
    position()
  }, [open, position])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {

      const target = event.target
      if (target instanceof Element && target.closest(`.${CCB_CLASS.panel}`) !== null) return
      if (!rootRef.current?.contains(target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [open, position, onClose, rootRef])

  return point
}

export interface CreditsPanelProps {
  t: (key: string, vars?: Record<string, string>) => string
  point: PanelPoint
  status: StatusPayload | undefined
  loadError: string | undefined
  quota: QuotaView | undefined
  quotaError: string | undefined
  model: ModelFactView | undefined

  markSvg: string
  maxMode: boolean
  maxBusy: boolean
  maxError: string | undefined
  onToggleMaxMode: () => void
}

export function CreditsPanel({
  t,
  point,
  status,
  loadError,
  quota,
  quotaError,
  model,
  markSvg,
  maxMode,
  maxBusy,
  maxError,
  onToggleMaxMode,
}: CreditsPanelProps) {

  const modelFactsText = formatModelFacts(model)

  const account = status?.account

  const accountText = [
    account?.accountType === 'enterprise' || account?.accountType === 'ultimate'
      ? t('account.enterprise')
      : account?.accountType === 'personal'
        ? t('account.personal')
        : undefined,
    account?.enterpriseName,
  ].filter((part): part is string => part !== undefined).join(' · ') || undefined

  const userBadge = account?.enterpriseUserName !== undefined
    ? account.enterpriseUserName
      + (account.nickname !== undefined && account.nickname !== account.enterpriseUserName
        ? ' · ' + account.nickname
        : '')
    : account?.nickname

  const ratio = quota !== undefined && quota.limit > 0
    ? Math.min(1, Math.max(0, quota.used / quota.limit))
    : 0
  const percent = Math.round(ratio * 100)
  const percentLabel = percentText(ratio)
  const resetAt = formatReset(quota?.resetAt)
  const resetDays = resetAt === undefined ? null : daysUntil(resetAt)

  return (
    <div
      className={CCB_CLASS.panel}
      role="dialog"
      aria-label={t('indicator.title')}
      style={{ top: point.top, right: point.right, width: point.width }}
    >
      <div className={CCB_CLASS.panelHead}>
        <span className={CCB_CLASS.panelMark} dangerouslySetInnerHTML={{ __html: markSvg }} />
        {}
        <span className={CCB_CLASS.panelTitle}>
          {t('indicator.title')}
        </span>
        {userBadge !== undefined
          ? (
            <a
              href={safeExternalHref(PROFILE_URL)}
              target="_blank"
              rel="noopener noreferrer"
              title={t('indicator.profile')}
              className={CCB_CLASS.badge}
            >
              {userBadge}
            </a>
          )
          : null}
      </div>
      {status === undefined && loadError === undefined
        ? <BusyDot label={t('indicator.loading')} className={CCB_CLASS.caption} />
        : null}
      {status?.keyConfigured === true
        ? (
          <>
            {accountText !== undefined
              ? <div className={CCB_CLASS.caption}>{accountText}</div>
              : null}
            {quota === undefined && quotaError === undefined
              ? <BusyDot label={t('indicator.loading')} className={CCB_CLASS.caption} />
              : null}
            {quota !== undefined
              ? (
                <>
                  {}
                  <div className={CCB_CLASS.quotaTitle}>
                    {t('indicator.quotaTitle')}
                  </div>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className={CCB_CLASS.quotaTrack}
                  >
                    {quota.used > 0
                      ? (
                        <div
                          className={CCB_CLASS.quotaFill}
                          style={{ width: percent + '%' }}
                        />
                      )
                      : null}
                    <span className={CCB_CLASS.quotaText}>
                      {t('indicator.used', {
                        used: formatCredits(quota.used),
                        limit: formatCredits(quota.limit),
                        percent: percentLabel,
                      })}
                    </span>
                  </div>
                  <div className={CCB_CLASS.caption}>
                    {t('indicator.remainingLabel')}{' '}
                    <span className={CCB_CLASS.creditValue}>{formatCredits(quota.remaining)}</span>
                  </div>
                  {resetAt !== undefined
                    ? (
                      <div className={CCB_CLASS.caption}>
                        {t('indicator.reset', { reset: resetAt })}
                        {resetDays !== null
                          ? ' ' + t('indicator.resetDays', { days: String(resetDays) })
                          : ''}
                      </div>
                    )
                    : null}
                </>
              )
              : null}
            {quotaError !== undefined
              ? <div className={CCB_CLASS.danger}>{quotaError}</div>
              : null}
          </>
        )
        : null}
      {loadError !== undefined
        ? <div className={CCB_CLASS.danger}>{loadError}</div>
        : null}
      {}
      {status?.keyConfigured === true
        ? (
          <>
            <div className={CCB_CLASS.divider} />
            <div className={CCB_CLASS.maxRow}>
              <span className={CCB_CLASS.maxLabel}>
                {t('indicator.max.title')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={maxMode}
                aria-label={t('indicator.max.title')}
                title={t('indicator.max.hint')}
                disabled={maxBusy}
                onClick={onToggleMaxMode}
                className={maxMode ? `${CCB_CLASS.maxSwitch} ${CCB_CLASS.maxSwitchOn}` : CCB_CLASS.maxSwitch}
              >
                <span className={CCB_CLASS.maxKnob} />
              </button>
            </div>
            {maxError !== undefined
              ? <div className={CCB_CLASS.danger}>{maxError}</div>
              : null}
          </>
        )
        : null}
      {model !== undefined
        ? (
          <>
            <div className={CCB_CLASS.divider} />
            {}
            <div className={CCB_CLASS.modelRow}>
              <span className={CCB_CLASS.modelName}>
                {model.name}
              </span>
              {modelFactsText === undefined
                ? null
                : (
                  <span className={CCB_CLASS.modelFacts}>
                    {modelFactsText}
                  </span>
                )}
            </div>
            {model.description !== undefined
              ? <div className={CCB_CLASS.caption}>{model.description}</div>
              : null}
            <div className={CCB_CLASS.featuresRow}>
              <span className={CCB_CLASS.caption}>{t('indicator.model.features')}</span>
              <span className={CCB_CLASS.featuresValue}>
                {[
                  model.vision ? t('indicator.model.visionFeature') : null,
                  model.efforts !== undefined && model.efforts.length > 0 ? t('indicator.model.reasoningFeature') : null,
                ].filter((item): item is string => item !== null).join(' · ')}
              </span>
            </div>
          </>
        )
        : null}
    </div>
  )
}
