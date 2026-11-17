

import { API_PREFIX } from '../constants.js'
import { fetchLocal } from './fetch-timeout.js'
const MAX_MODE_URL = `${API_PREFIX}/max-mode`

export const MAX_MODE_CHANGED_EVENT = 'codebuddy-credits-max-mode-changed'

let current = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
  window.dispatchEvent(new Event(MAX_MODE_CHANGED_EVENT))
}

export function syncMaxMode(value: boolean): void {
  if (value === current) return
  current = value
  emit()
}


export function subscribeMaxMode(fn: () => void): () => void {
  listeners.add(fn)
  window.addEventListener(MAX_MODE_CHANGED_EVENT, fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener(MAX_MODE_CHANGED_EVENT, fn)
  }
}

export function getMaxMode(): boolean {
  return current
}


export async function setMaxMode(enabled: boolean): Promise<void> {
  const prev = current
  syncMaxMode(enabled)
  try {
    const response = await fetchLocal(MAX_MODE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
      cache: 'no-store',
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(payload.error ?? 'HTTP ' + String(response.status))
    }
    const payload = await response.json() as { maxMode?: boolean }
    syncMaxMode(payload.maxMode === true)
  } catch (error) {
    syncMaxMode(prev)
    throw error
  }
}
