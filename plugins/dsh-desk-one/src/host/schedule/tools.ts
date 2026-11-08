/**
 * Schedule tools for the agent surface (read-only): the same mirror the page renders, queried by
 * range. Sync is exposed as an explicit action so the model can refresh before answering.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SCHEDULE_PROVIDERS, type ScheduleProvider } from '../../constants.js'
import type { ScheduleHost } from './host.js'

const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const ISO = /^\d{4}-\d{2}-\d{2}T/u

function rangeOf(args: { readonly from?: string; readonly to?: string }): { from: string; to: string } {
  const now = new Date()
  const fallback = (days: number): string => new Date(now.getTime() + days * 86_400_000).toISOString()
  const from = args.from === undefined ? now.toISOString() : args.from
  const to = args.to === undefined ? fallback(7) : args.to
  if (!ISO.test(from) || !ISO.test(to) || Date.parse(from) >= Date.parse(to)) {
    throw new Error('from / to 必须是 ISO 时间且 from < to')
  }
  return { from, to }
}

export function registerScheduleTools(ctx: Context, schedule: ScheduleHost): void {
  ctx.tools.register(defineTool({
    name: 'desk_schedule_list',
    description: 'List mirrored schedule events in a UTC time range (default: now to +7 days). Read-only: events come from the connected external calendars.',
    parameters: {
      from: { type: 'string', description: 'Range start, ISO 8601 UTC (default now).' },
      to: { type: 'string', description: 'Range end, ISO 8601 UTC (default now + 7 days).' },
      provider: { type: 'string', enum: SCHEDULE_PROVIDERS, description: 'Optional source filter.' },
    },
    output: textOutput,
    async execute(args) {
      const { from, to } = rangeOf(args)
      const provider = args.provider as ScheduleProvider | undefined
      const result = schedule.events(from, to, undefined, provider)
      const events = result.events.map(event => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        provider: event.provider,
        calendar: event.calendarRemoteId,
        location: event.location,
        busy: event.busy,
      }))
      return JSON.stringify({ ok: true, from, to, count: events.length, events })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_schedule_sync',
    description: 'Manually refresh every connected calendar source and return a per-source report.',
    parameters: {},
    output: textOutput,
    async execute() {
      const report = await schedule.sync()
      return JSON.stringify({ ok: true, ...report })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desk_schedule_connections',
    description: 'Show schedule connection status and calendars (never credential values).',
    parameters: {},
    output: textOutput,
    async execute() {
      const state = schedule.state()
      return JSON.stringify({
        ok: true,
        sources: state.sources.map(source => ({
          provider: source.provider,
          channel: source.channel,
          account: source.account,
          syncState: source.syncState,
          lastSyncedAt: source.lastSyncedAt,
          lastError: source.lastError,
        })),
        calendars: state.calendars.map(calendar => ({
          id: calendar.id,
          name: calendar.displayName,
          provider: calendar.provider,
          enabled: calendar.enabled,
          color: calendar.color,
        })),
      })
    },
  }))
}
