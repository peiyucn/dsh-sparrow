/**
 * One CalDAV account card (WeCom / iCloud): calendar rows, sync and display switches, and a
 * collapsible connection form. An already-configured source keeps its form collapsed.
 */

import { providerKey } from '../shared.js'
import { ProviderLogo } from './logos.js'
import { useState } from 'react'
import type { DeskCalendar, DeskScheduleSource, ScheduleConnectionInput } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { ReactElement } from 'react'
import type { ScheduleApi } from '../api.js'
import type { ScheduleProvider } from '../../../constants.js'

export function CalendarRows(props: {
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


export function ProviderCard(props: {
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

