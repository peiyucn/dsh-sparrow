

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { boundedSet } from './boundedCache.js'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { CreditDialog } from './CreditDialog.js'
import { useCreditStatDialog, type AnchorStyles } from './statDialog.js'
import { fetchLocal } from './fetch-timeout.js'
import { formatCredits } from './format.js'
import { API_PREFIX } from '../constants.js'
import { CCB_CLASS } from './styles.js'

const SESSION_USAGE_URL = `${API_PREFIX}/session-usage`

const REFRESH_DEBOUNCE_MS = 800

interface SessionUsageView {
  credit: number
  calls: number
  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}


const usageCache = new Map<string, SessionUsageView>()

const USAGE_CACHE_MAX = 200

export interface CodeBuddyCreditsStatsProps {
  t: (key: string, vars?: Record<string, string>) => string

  sessionId: string

  useChat: <T>(selector: (snapshot: { legacy?: { nodes?: readonly unknown[] } | null }) => T) => T
}

export function CodeBuddyCreditsStats({ t, sessionId, useChat }: CodeBuddyCreditsStatsProps) {
  const [usage, setUsage] = useState<SessionUsageView | undefined>(() => usageCache.get(sessionId))
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const { open, toggle, panelRef, anchorName } = useCreditStatDialog(buttonRef)

  const load = useCallback(() => {
    void fetchLocal(`${SESSION_USAGE_URL}?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<SessionUsageView> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => {
        boundedSet(usageCache, sessionId, value, USAGE_CACHE_MAX)
        setUsage(value)
      })
      .catch(() => {

      })
  }, [sessionId])

  useEffect(() => {
    load()
    const onStatusChanged = () => { load() }
    const onFocus = () => { load() }
    window.addEventListener('codebuddy-credits-status-changed', onStatusChanged)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('codebuddy-credits-status-changed', onStatusChanged)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])


  const nodes = useChat(snapshot => snapshot.legacy?.nodes ?? null)
  useEffect(() => {
    const timer = setTimeout(() => { load() }, REFRESH_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [nodes, load])

  const active = usage !== undefined && usage.calls > 0

  return (
    <>
      {active
        ? (
          <button
            ref={buttonRef}
            type="button"
            className={CCB_CLASS.statsPill}
            style={{ anchorName } as AnchorStyles}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t('stats.sessionCreditsAria', {
              credit: formatCredits(usage.credit),
              calls: String(usage.calls),
            })}
            onClick={toggle}
          >
            <CodeBuddyMark />
            <span className={CCB_CLASS.statsLabel}>
              {t('stats.sessionCredits', {
                credit: formatCredits(usage.credit),
                calls: String(usage.calls),
              })}
            </span>
          </button>
        )
        : null}
      {active && open
        ? createPortal(
          <CreditDialog
            panelRef={panelRef}
            anchorName={anchorName}
            ariaLabel={t('stats.sessionCreditsTitle')}
            title={t('stats.sessionCreditsTitle')}
            credit={usage.credit}
            callsLabel={t('turnCredit.calls')}
            calls={usage.calls}
            perCallLabel={t('turnCredit.perCall')}
            byModel={usage.byModel}
          />,
          document.body,
        )
        : null}
    </>
  )
}
