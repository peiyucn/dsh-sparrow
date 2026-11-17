

import { CCB_CLASS } from './styles.js'


function rowHead(root: HTMLElement): Element | null {
  const li = root.closest('li')
  return li?.querySelector(':scope > div:first-child') ?? null
}


function rowActions(root: HTMLElement): Element | null {
  return rowHead(root)?.querySelector(':scope > span:last-child') ?? null
}


export function isRowEditTrigger(root: HTMLElement | null, target: EventTarget | null): boolean {
  if (root === null || target === null || !(target instanceof Node)) return false
  const button = rowActions(root)?.querySelector('button:first-of-type') ?? null
  return button !== null && (button === target || button.contains(target))
}


export function shouldAutoExpandSetup(root: HTMLElement | null): boolean {
  if (root === null) return false
  const head = rowHead(root)
  if (head === null) return false
  return head.querySelector(':scope > span:last-child') === null
}


export function insertSavedNotice(root: HTMLElement | null, text: string): (() => void) | undefined {
  if (root === null) return undefined
  const li = root.closest('li')
  if (li === null) return undefined
  const rows = li.parentElement
  const section = rows?.parentElement
  if (rows === null || rows === undefined || section === null || section === undefined) return undefined
  const notice = document.createElement('p')
  notice.textContent = text
  notice.setAttribute('role', 'status')
  notice.setAttribute('aria-live', 'polite')
  notice.className = CCB_CLASS.cardNotice
  section.insertBefore(notice, rows)
  return () => { notice.remove() }
}
