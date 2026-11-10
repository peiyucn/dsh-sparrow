/** Microsoft personal account: Graph OAuth (browser redirect + PKCE, device code fallback). */

import { CalendarRows } from './provider-card.js'
import { MicrosoftLogo, ProviderLogo } from './logos.js'
import { useEffect, useRef, useState } from 'react'
import type { DeskCalendar, DeskScheduleSource } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { ReactElement } from 'react'
import type { ScheduleApi } from '../api.js'

export function OutlookGraphCard(props: {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly source?: DeskScheduleSource
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
}): ReactElement {
  const { t, api, source, calendars } = props
  const [flow, setFlow] = useState<{ flowId: string; kind: 'redirect' | 'device'; userCode: string; verificationUri: string } | null>(null)
  const popupRef = useRef<Window | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (flow === null) return
    let stopped = false
    const tick = async (): Promise<void> => {
      try {
        const result = await api.pollOutlookLogin(flow.flowId)
        if (stopped) return
        if (result.status === 'connected') {
          popupRef.current?.close()
          popupRef.current = null
          setFlow(null)
          await props.onChanged()
        }
      } catch (reason) {
        if (!stopped) setError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    const timer = window.setInterval(() => { void tick() }, 5000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [api, flow, props])

  const login = async (device = false): Promise<void> => {
    setBusy(true); setError(null)
    const popup = device ? null : window.open('', 'desk-one-outlook', 'width=520,height=680')
    popupRef.current = popup
    try {
      // Microsoft ignores the port for localhost redirect URIs, so the DSH port can vary.
      const port = window.location.port === '' ? '' : `:${window.location.port}`
      const redirectUri = device ? undefined : `http://localhost${port}/api/desk-one/schedule/outlook/callback`
      const start = await api.startOutlookLogin(redirectUri)
      if (start.kind === 'redirect' && start.authUrl !== undefined) {
        if (popup === null || popup.closed) window.location.href = start.authUrl
        else popup.location.href = start.authUrl
        setFlow({ flowId: start.flowId, kind: 'redirect', userCode: '', verificationUri: '' })
      } else {
        popup?.close()
        setFlow({ flowId: start.flowId, kind: 'device', userCode: start.userCode, verificationUri: start.verificationUri })
      }
    } catch (reason) {
      popup?.close()
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      await api.disconnectOutlook()
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return (
    <section className="dsh-desk-schedule-connection-card" data-connected={source !== undefined}>
      <header>
        <ProviderLogo provider="outlook" />
        <h3>{t('schedule.provider.outlook')}</h3>
        <span className="dsh-desk-schedule-statusdot" data-on={source !== undefined} />
        <span className="dsh-desk-schedule-connection-status">
          {source === undefined ? t('schedule.graphPending') : t('schedule.form.connected')}
        </span>
        {source === undefined ? null : (
          <button type="button" className="dsh-desk-schedule-chip" disabled={busy} onClick={() => { void disconnect() }}>
            {t('schedule.graphDisconnect')}
          </button>
        )}
      </header>
      {source === undefined ? (
        <>
          <p className="dsh-desk-schedule-form-note">{t('schedule.graphLoginHint')}</p>
          {flow === null ? (
            <div className="dsh-desk-schedule-form-actions">
              <button type="button" className="dsh-desk-btn dsh-desk-btn-primary dsh-desk-graph-login" disabled={busy} onClick={() => { void login() }}>
                <MicrosoftLogo />
                {busy ? t('schedule.form.saving') : t('schedule.graphLogin')}
              </button>
              <button type="button" className="dsh-desk-schedule-link" disabled={busy} onClick={() => { void login(true) }}>
                {t('schedule.graphDeviceLogin')}
              </button>
            </div>
          ) : flow.kind === 'redirect' ? (
            <p className="dsh-desk-schedule-form-ok">{t('schedule.graphRedirectHint')}</p>
          ) : (
            <p className="dsh-desk-schedule-form-ok">
              {t('schedule.graphCodeHint', { url: flow.verificationUri, code: flow.userCode })}
            </p>
          )}
        </>
      ) : (
        <div className="dsh-desk-schedule-source">
          <p className="dsh-desk-schedule-sync-hint">{t('schedule.syncCalendarHint')}</p>
          <CalendarRows
            t={t}
            calendars={calendars}
            counts={props.counts}
            hidden={props.hidden}
            onToggle={props.onToggle}
            onColor={props.onColor}
            onSetEnabled={props.onSetEnabled}
          />
        </div>
      )}
      {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
    </section>
  )
}
