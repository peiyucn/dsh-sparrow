

type CalendarProvider = 'wecom' | 'icloud' | 'outlook' | 'ics'


export interface RemoteCalendar {
  provider: CalendarProvider
  remoteId: string
  displayName: string
  order: number
}


export interface RemoteEvent {
  provider: CalendarProvider
  calendarRemoteId: string

  externalId: string
  uid: string
  recurrenceId?: string
  title: string
  description?: string
  location?: string
  organizer?: string
  attendees?: readonly string[]
  startUtc: string
  endUtc: string
  allDay: boolean

  timezone: string
  busy: boolean
  url?: string
  rrule?: string
}


export interface PullWindow {
  startUtc: string
  endUtc: string
}


type SyncErrorKind = 'AUTH_EXPIRED' | 'TRANSIENT' | 'UNSUPPORTED'

export class ScheduleError extends Error {
  constructor(readonly kind: SyncErrorKind, message: string, private readonly explicitCode?: string) {
    super(message)
    this.name = 'ScheduleError'
  }


  get status(): number {
    return this.kind === 'AUTH_EXPIRED' ? 409 : 503
  }


  get code(): string {
    return this.explicitCode ?? (this.kind === 'AUTH_EXPIRED' ? 'SCHEDULE_AUTH_EXPIRED' : 'SCHEDULE_UNAVAILABLE')
  }
}
