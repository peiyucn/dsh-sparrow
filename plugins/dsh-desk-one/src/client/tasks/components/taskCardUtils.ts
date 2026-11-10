/**
 * Small task-card helpers: local-day math for due warnings and the textarea auto-grow trick.
 * Pure functions with no React dependency, kept out of TaskCard so the component stays about UI.
 */

/** Local YYYY-MM-DD (due dates are day-granular, so "due soon" is a local-calendar question). */
export function localToday(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

export function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - localToday().getTime()) / 86_400_000)
}

/** Reset height then follow scrollHeight — the standard textarea auto-grow trick. */
export function autoGrow(element: HTMLTextAreaElement | null): void {
  if (element === null) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}
