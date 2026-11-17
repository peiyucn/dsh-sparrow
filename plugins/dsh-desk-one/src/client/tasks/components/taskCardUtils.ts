


function localToday(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

export function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - localToday().getTime()) / 86_400_000)
}


export function autoGrow(element: HTMLTextAreaElement | null): void {
  if (element === null) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}
