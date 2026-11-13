/** Provider-agnostic ICS subscriptions: several URLs, each one its own read-only calendar. */

import { useState } from 'react'
import { SourceIssues } from './issues.js'
import { sourceHealth } from './status.js'
import type { DeskCalendar, DeskScheduleSource } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import type { ReactElement } from 'react'
import type { ScheduleApi } from '../api.js'

export function SubscriptionCard(props: {
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
        const health = sourceHealth(source, own)
        return (
          <div key={source.id} className="dsh-desk-schedule-subscription">
            <div className="dsh-desk-schedule-subscription-head">
              <span className="dsh-desk-schedule-mgmt-name">{source.account ?? t('schedule.subscriptions')}</span>
              <span
                className="dsh-desk-schedule-statusdot"
                data-on={health.tone === 'ok'}
                data-tone={health.tone}
                data-error={health.tone === 'error' ? 'true' : undefined}
                role="img"
                aria-label={health.tone === 'error' ? t('schedule.subscriptionFailed') : health.tone === 'warn' ? t('schedule.statusWarning') : t('schedule.subscriptionSynced')}
                title={health.tone === 'error' ? t('schedule.subscriptionFailed') : health.tone === 'warn' ? t('schedule.statusWarning') : t('schedule.subscriptionSynced')}
              />
              <button
                type="button"
                className="dsh-desk-schedule-link"
                disabled={busy}
                onClick={() => { void remove(source.id) }}
              >{t('schedule.removeSubscription')}</button>
            </div>
            <SourceIssues t={t} health={health} />
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
