/**
 * TEMPORARY probe: answer "does the source calendar send ATTENDEE at all?" without touching
 * credentials or writing event content. Dumps property NAMES per event plus attendee CN/email
 * samples to the OS temp dir, so the answer can be read out of band.
 *
 * Delete this file (and its call site in ical.ts) once the question is answered.
 */

import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface ProbeEntry {
  readonly title: string
  readonly properties: readonly string[]
  readonly attendeeCount: number
  readonly attendees: readonly string[]
}

interface ProbeComponent {
  readonly getAllProperties: () => readonly { readonly name: string; readonly jCal?: readonly unknown[] }[]
}

const MAX_ENTRIES = 300
const MAX_SAMPLES = 5

let entries: ProbeEntry[] = []
let scheduled = false

/** Pure extraction, unit-testable: property names + attendee samples for one VEVENT. */
export function describeComponent(component: ProbeComponent): ProbeEntry {
  const properties = component.getAllProperties()
  const names = [...new Set(properties.map((property) => property.name.toUpperCase()))].sort()
  const attendees: string[] = []
  for (const property of properties) {
    if (property.name.toUpperCase() !== 'ATTENDEE') continue
    const value = property.jCal?.[3]
    const text = typeof value === 'string' ? value.trim() : ''
    const label = text.replace(/^mailto:/iu, '')
    if (label !== '' && attendees.length < MAX_SAMPLES) attendees.push(label)
  }
  const titleProperty = properties.find((property) => property.name.toUpperCase() === 'SUMMARY')
  const rawTitle = titleProperty?.jCal?.[3]
  return {
    title: typeof rawTitle === 'string' ? rawTitle.slice(0, 60) : '',
    properties: names,
    attendeeCount: properties.filter((property) => property.name.toUpperCase() === 'ATTENDEE').length,
    attendees,
  }
}

/** Queue one event for the dump; the write is debounced so a pull costs at most one write. */
export function recordAttendeeProbe(entry: ProbeEntry): void {
  if (entries.length >= MAX_ENTRIES) return
  entries.push(entry)
  if (scheduled) return
  scheduled = true
  setTimeout(() => {
    scheduled = false
    const payload = JSON.stringify({ capturedAt: new Date().toISOString(), entries }, null, 2)
    void writeFile(join(tmpdir(), 'desk-one-attendee-probe.json'), payload, 'utf8').catch(() => undefined)
  }, 500)
}

/**
 * Kept for callers that want an explicit reset; the parse path no longer calls it because one sync
 * pulls several calendars and each is parsed separately -- resetting per parse would keep only the
 * last calendar's events.
 */
export function resetAttendeeProbe(): void {
  entries = []
}
