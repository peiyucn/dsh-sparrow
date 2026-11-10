/**
 * Calendar settings sub-page: per-provider connection cards, the Outlook Graph card and
 * provider-agnostic ICS subscriptions. Management lives here, not on the calendar page.
 */

import { PROVIDER_ORDER, providerKey } from './shared.js'
import { SubPageHeader } from '../app/SubPageHeader.js'
import { useEffect, useRef, useState } from 'react'
import type { DeskCalendar, DeskScheduleSource, ScheduleConnectionInput } from '../../contract.js'
import type { DeskTranslator } from '../app/types.js'
import type { ReactElement } from 'react'
import type { ScheduleApi } from './api.js'
import type { ScheduleProvider } from '../../constants.js'

/* ------------------------------- sources page -------------------------------- */

interface SourcesPageProps {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly sources: readonly DeskScheduleSource[]
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
  /** Manual force-sync lives here: pulling calendars is part of source management. */
  readonly onSync: () => void
  readonly syncing: boolean
  /** Sync/load failure surfaced here, because the calendar toolbar is not on this page. */
  readonly syncError: string | null
}

/**
 * One source card: status header, in-card calendar selection and a collapsible connection form.
 * A configured source keeps its form collapsed; the whole block (connection + calendars) is one
 * surface instead of two stacked boxes.
 */
/** Calendar rows shared by the personal-account cards and the Outlook Graph card. */
function CalendarRows(props: {
  readonly t: DeskTranslator
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
}): ReactElement {
  const { t, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  return (
    <>
      {calendars.length === 0 ? <p className="dsh-desk-schedule-hint">{t('schedule.noCalendars')}</p> : null}
      {calendars.map(calendar => (
        <div key={calendar.id} className="dsh-desk-schedule-mgmt-row" data-off={!calendar.enabled}>
          <button
            type="button"
            className="dsh-desk-schedule-colorbutton"
            style={{ background: calendar.color }}
            title={t('schedule.changeColor')}
            aria-label={t('schedule.changeColor')}
            onClick={() => { void onColor(calendar) }}
          />
          <span className="dsh-desk-schedule-mgmt-name">{calendar.displayName}</span>
          <span className="dsh-desk-schedule-mgmt-count">{counts[calendar.id] ?? 0}</span>
          <span className="dsh-desk-schedule-mgmt-label">{t('schedule.syncLabel')}</span>
          <button
            type="button"
            className="dsh-desk-switch"
            role="switch"
            aria-checked={calendar.enabled}
            data-on={calendar.enabled}
            title={t('schedule.syncCalendar')}
            aria-label={t('schedule.syncCalendar')}
            onClick={() => { void onSetEnabled(calendar, !calendar.enabled) }}
          />
          <span className="dsh-desk-schedule-mgmt-label">{t('schedule.displayLabel')}</span>
          <button
            type="button"
            className="dsh-desk-switch"
            role="switch"
            aria-checked={!hidden.has(calendar.id)}
            data-on={!hidden.has(calendar.id)}
            aria-label={t('schedule.showCalendar')}
            onClick={() => onToggle(calendar)}
          />
        </div>
      ))}
    </>
  )
}

/** Microsoft four-square mark used on the OAuth button (official brand colours). */
function MicrosoftLogo(): ReactElement {
  return (
    <svg viewBox="0 0 23 23" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  )
}

/** Provider marks: Apple / Microsoft / Tencent, kept inline so no icon dependency ships. */
function AppleLogo(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M11.932 6.908c.95 0 2.727-1.291 4.595-1.1.782.032 2.976.316 4.388 2.38-.113.069-2.622 1.528-2.593 4.565.034 3.617 3.166 4.828 3.221 4.85-.029.086-.506 1.723-1.658 3.416-1.002 1.463-2.039 2.919-3.675 2.95-1.606.03-2.125-.955-3.96-.955s-2.409.923-3.931.984c-1.581.06-2.78-1.58-3.79-3.037-2.065-2.98-3.64-8.422-1.527-12.087 1.051-1.824 2.93-2.98 4.969-3.009 1.549-.032 3.011 1.043 3.96 1.043zM16.552 0c.153 1.407-.411 2.817-1.251 3.833-.837 1.013-2.214 1.804-3.555 1.7-.185-1.378.495-2.814 1.27-3.712C13.883.805 15.346.05 16.553 0z" />
    </svg>
  )
}

function TencentLogo(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor" style={{ color: '#0052d9' }}>
      <path d="M9.976 1L24 9.8l-10.587.015L10.723 23H5.489L8.18 9.8H3.244L1 5.4h8.077L9.976 1z" />
    </svg>
  )
}

function ProviderLogo(props: { readonly provider: ScheduleProvider }): ReactElement {
  if (props.provider === 'outlook') return <MicrosoftLogo />
  if (props.provider === 'icloud') return <AppleLogo />
  return <TencentLogo />
}

/** Outlook personal account: OAuth device code, never a published ICS link. */
function OutlookGraphCard(props: {
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

function ProviderCard(props: {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly provider: ScheduleProvider
  readonly source?: DeskScheduleSource
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
}): ReactElement {
  const { t, api, provider, source, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  const connected = source !== undefined
  const [editing, setEditing] = useState(!connected)
  const [account, setAccount] = useState(source?.account ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const input = (): ScheduleConnectionInput => ({ provider, account, password })

  const runTest = async (): Promise<void> => {
    setBusy('test'); setError(null); setMessage(null)
    try {
      const result = await api.testConnection(input())
      setMessage(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  const save = async (): Promise<void> => {
    setBusy('save'); setError(null); setMessage(null)
    try {
      await api.saveConnection(input())
      setPassword('')
      setMessage(t('schedule.form.saved'))
      setEditing(false)
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  const disconnect = async (): Promise<void> => {
    setBusy('save'); setError(null); setMessage(null)
    try {
      await api.removeConnection(provider)
      setMessage(t('schedule.form.removed'))
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(null) }
  }

  const enabledCount = calendars.filter(calendar => calendar.enabled).length
  return (
    <section className="dsh-desk-schedule-connection-card" data-connected={connected}>
      <header>
        <ProviderLogo provider={provider} />
        <h3>{t(providerKey(provider) as never)}</h3>
        <span className="dsh-desk-schedule-statusdot" data-on={connected} />
        <span className="dsh-desk-schedule-connection-status" data-error={source?.syncState === 'error'}>
          {connected ? t('schedule.form.connected') : t('schedule.form.notConnected')}
        </span>
        {connected ? <span className="dsh-desk-schedule-connection-count">{enabledCount}/{calendars.length}</span> : null}
        <button type="button" className="dsh-desk-schedule-chip" onClick={() => setEditing(value => !value)}>
          {editing ? t('schedule.collapse') : t('schedule.connectionSettings')}
        </button>
      </header>

      {connected && !editing ? (
        <div className="dsh-desk-schedule-source">
          <p className="dsh-desk-schedule-sync-hint">{t('schedule.syncCalendarHint')}</p>
          <CalendarRows
            t={t}
            calendars={calendars}
            counts={counts}
            hidden={hidden}
            onToggle={onToggle}
            onColor={onColor}
            onSetEnabled={onSetEnabled}
          />
        </div>
      ) : null}

      {editing ? (
        <div className="dsh-desk-schedule-connection-form">
          <div className="dsh-desk-schedule-form-fields">
            <label>
              <span>{t('schedule.form.account')}</span>
              <input value={account} onChange={event => setAccount(event.target.value)} spellCheck={false} autoComplete="username" />
            </label>
            <label>
              <span>{t('schedule.form.password')}</span>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
            </label>
          </div>
          <p className="dsh-desk-schedule-form-note">{t(`schedule.form.note.${provider}` as never)}</p>
          {provider === 'icloud' ? (
            <>
              <a
                className="dsh-desk-schedule-link"
                href="https://account.apple.com/account/manage"
                target="_blank"
                rel="noreferrer"
              >{t('schedule.form.applePasswordLink')}</a>
              <details className="dsh-desk-schedule-steps">
                <summary>{t('schedule.icloud.stepsTitle')}</summary>
                <ol>
                  <li>{t('schedule.icloud.step1')}</li>
                  <li>{t('schedule.icloud.step2')}</li>
                  <li>{t('schedule.icloud.step3')}</li>
                </ol>
              </details>
            </>
          ) : null}
          {message === null ? null : <p className="dsh-desk-schedule-form-ok">{message}</p>}
          {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
          <div className="dsh-desk-schedule-form-actions">
            <button type="button" className="dsh-desk-schedule-chip" disabled={busy !== null} onClick={() => { void runTest() }}>
              {busy === 'test' ? t('schedule.form.testing') : t('schedule.form.test')}
            </button>
            <button type="button" className="dsh-desk-btn dsh-desk-btn-primary" disabled={busy !== null} onClick={() => { void save() }}>
              {busy === 'save' ? t('schedule.form.saving') : t('schedule.form.save')}
            </button>
            {connected ? (
              <button type="button" className="dsh-desk-schedule-chip" disabled={busy !== null} onClick={() => { void disconnect() }}>
                {t('schedule.form.remove')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Provider-agnostic ICS subscriptions: several URLs, each one its own read-only calendar. */
function SubscriptionCard(props: {
  readonly t: DeskTranslator
  readonly api: ScheduleApi
  readonly sources: readonly DeskScheduleSource[]
  readonly calendars: readonly DeskCalendar[]
  readonly counts: Readonly<Record<string, number>>
  readonly hidden: Set<string>
  readonly onToggle: (calendar: DeskCalendar) => void
  readonly onColor: (calendar: DeskCalendar) => Promise<void>
  readonly onSetEnabled: (calendar: DeskCalendar, enabled: boolean) => Promise<void>
  readonly onChanged: () => Promise<void>
}): ReactElement {
  const { t, api, sources, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const add = async (): Promise<void> => {
    setBusy(true); setError(null); setMessage(null)
    try {
      await api.addSubscription({ name, url })
      setName(''); setUrl('')
      setMessage(t('schedule.form.saved'))
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  const remove = async (sourceId: string): Promise<void> => {
    setBusy(true); setError(null); setMessage(null)
    try {
      await api.removeSubscription(sourceId)
      await props.onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return (
    <section className="dsh-desk-schedule-connection-card">
      <header>
        <h3>{t('schedule.subscriptions')}</h3>
        <span className="dsh-desk-schedule-connection-status">{t('schedule.subscriptionHint')}</span>
      </header>
      {sources.length === 0 ? <p className="dsh-desk-schedule-form-note">{t('schedule.subscriptionEmpty')}</p> : null}
      {sources.map(source => {
        const own = calendars.filter(calendar => calendar.sourceId === source.id)
        // The status dot belongs to each subscription: one ICS card can hold several, and only the
        // individual feed knows whether its own pull failed.
        const failed = source.syncState === 'error'
        return (
          <div key={source.id} className="dsh-desk-schedule-subscription">
            <div className="dsh-desk-schedule-subscription-head">
              <span className="dsh-desk-schedule-mgmt-name">{source.account ?? t('schedule.subscriptions')}</span>
              <span
                className="dsh-desk-schedule-statusdot"
                data-on={!failed}
                data-error={failed ? 'true' : undefined}
                role="img"
                aria-label={failed ? t('schedule.subscriptionFailed') : t('schedule.subscriptionSynced')}
                title={failed ? t('schedule.subscriptionFailed') : t('schedule.subscriptionSynced')}
              />
              <button
                type="button"
                className="dsh-desk-schedule-link"
                disabled={busy}
                onClick={() => { void remove(source.id) }}
              >{t('schedule.removeSubscription')}</button>
            </div>
            {own.map(calendar => (
              <div key={calendar.id} className="dsh-desk-schedule-mgmt-row" data-off={!calendar.enabled}>
                <button
                  type="button"
                  className="dsh-desk-schedule-colorbutton"
                  style={{ background: calendar.color }}
                  title={t('schedule.changeColor')}
                  aria-label={t('schedule.changeColor')}
                  onClick={() => { void onColor(calendar) }}
                />
                <span className="dsh-desk-schedule-mgmt-name">{calendar.displayName}</span>
                <span className="dsh-desk-schedule-mgmt-count">{counts[calendar.id] ?? 0}</span>
                <span className="dsh-desk-schedule-mgmt-label">{t('schedule.syncLabel')}</span>
                <button
                  type="button"
                  className="dsh-desk-switch"
                  role="switch"
                  aria-checked={calendar.enabled}
                  data-on={calendar.enabled}
                  aria-label={t('schedule.syncCalendar')}
                  onClick={() => { void onSetEnabled(calendar, !calendar.enabled) }}
                />
                <span className="dsh-desk-schedule-mgmt-label">{t('schedule.displayLabel')}</span>
                <button
                  type="button"
                  className="dsh-desk-switch"
                  role="switch"
                  aria-checked={!hidden.has(calendar.id)}
                  data-on={!hidden.has(calendar.id)}
                  aria-label={t('schedule.showCalendar')}
                  onClick={() => onToggle(calendar)}
                />
              </div>
            ))}
          </div>
        )
      })}
      <div className="dsh-desk-schedule-form-fields">
        <label>
          <span>{t('schedule.subscriptionName')}</span>
          <input value={name} onChange={event => setName(event.target.value)} placeholder={t('schedule.subscriptionNameHint')} />
        </label>
        <label>
          <span>{t('schedule.subscriptionUrl')}</span>
          <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…/calendar.ics" spellCheck={false} />
        </label>
      </div>
      {error === null ? null : <p className="dsh-desk-schedule-error">{error}</p>}
      {message === null ? null : <p className="dsh-desk-schedule-form-ok">{message}</p>}
      <div className="dsh-desk-schedule-form-actions">
        <button type="button" className="dsh-desk-btn dsh-desk-btn-primary" disabled={busy || url.trim() === ''} onClick={() => { void add() }}>
          {busy ? t('schedule.form.saving') : t('schedule.addSubscription')}
        </button>
      </div>
    </section>
  )
}
export function SourcesPage(props: SourcesPageProps): ReactElement {
  const { t, sources, calendars, counts, hidden, onToggle, onColor, onSetEnabled } = props
  const connected = sources.length
  return (
    <div className="dsh-desk-schedule-page">
      <SubPageHeader
        title={t('schedule.sources')}
        {...(connected > 0 ? { count: t('schedule.sourceCount', { count: connected }) } : {})}
        action={(
          <button
            type="button"
            className="dsh-desk-schedule-chip"
            disabled={props.syncing}
            data-busy={props.syncing ? 'true' : undefined}
            onClick={props.onSync}
          >
            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.2 8.5A6 6 0 0 1 15.5 6M15.8 11.5A6 6 0 0 1 4.5 14M15.5 3.5V6h-2.5M4.5 16.5V14H7" />
            </svg>
            {props.syncing ? t('schedule.syncing') : t('schedule.refresh')}
          </button>
        )}
      />
      {props.syncError === null ? null : <p className="dsh-desk-schedule-error">{props.syncError}</p>}
      <div className="dsh-desk-schedule-sources-page">
        {PROVIDER_ORDER.map(provider => {
          const source = sources.find(item => item.provider === provider)
          return (
            <ProviderCard
              key={provider}
              t={t}
              api={props.api}
              provider={provider}
              {...(source === undefined ? {} : { source })}
              calendars={source === undefined ? [] : calendars.filter(calendar => calendar.sourceId === source.id)}
              counts={counts}
              hidden={hidden}
              onToggle={onToggle}
              onColor={onColor}
              onSetEnabled={onSetEnabled}
              onChanged={props.onChanged}
            />
          )
        })}
        {(() => {
          const graphSource = sources.find(item => item.provider === 'outlook' && item.channel === 'graph')
          return (
            <OutlookGraphCard
              t={t}
              api={props.api}
              {...(graphSource === undefined ? {} : { source: graphSource })}
              calendars={graphSource === undefined ? [] : calendars.filter(calendar => calendar.sourceId === graphSource.id)}
              counts={counts}
              hidden={hidden}
              onToggle={onToggle}
              onColor={onColor}
              onSetEnabled={onSetEnabled}
              onChanged={props.onChanged}
            />
          )
        })()}
        <SubscriptionCard
          t={t}
          api={props.api}
          sources={sources.filter(source => source.provider === 'ics')}
          calendars={calendars}
          counts={counts}
          hidden={hidden}
          onToggle={onToggle}
          onColor={onColor}
          onSetEnabled={onSetEnabled}
          onChanged={props.onChanged}
        />
      </div>
    </div>
  )
}
