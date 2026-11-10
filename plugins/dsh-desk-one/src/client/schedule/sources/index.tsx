/**
 * Calendar settings sub-page: per-provider connection cards, the Outlook Graph card and
 * provider-agnostic ICS subscriptions. Management lives here, not on the calendar page.
 */

import { OutlookGraphCard } from './outlook-card.js'
import { PROVIDER_ORDER } from '../shared.js'
import { ProviderCard } from './provider-card.js'
import { SubPageHeader } from '../../app/SubPageHeader.js'
import { SubscriptionCard } from './subscription-card.js'
import type { ReactElement } from 'react'
import type { SourcesPageProps } from './types.js'

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

