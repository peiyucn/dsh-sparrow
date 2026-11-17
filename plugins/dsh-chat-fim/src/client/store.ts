

import { useEffect, useState } from 'react'
import { ENABLED_STORAGE_KEY, SENSITIVITY_STORAGE_KEY } from '../constants.js'
import { DEFAULT_TRIGGER_SENSITIVITY, normalizeTriggerSensitivity, type TriggerSensitivity } from '../suggest.js'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SuggestionRecord } from './contracts.js'
import {
  fimSupportReducer, fimSupportShown, initialFimSupportState, type FimSupportEvent, type FimSupportState,
} from './fim-support-machine.js'


export function readEnabled(storage: { getItem(key: string): string | null }, key = ENABLED_STORAGE_KEY): boolean {
  const value = storage.getItem(key)
  return value === '1'
}


interface SharedStore<T> {
  get(): T
  set(next: T): void
  subscribe(listener: () => void): () => void
}

function createStore<T>(initial: T, persist?: (next: T) => void): SharedStore<T> {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next: T): void {
      if (current === next) return
      current = next
      persist?.(next)
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}


function useSharedValue<T>(
  read: () => T,
  store: { subscribe(listener: () => void): () => void },
  deps: readonly unknown[] = [],
): T {
  const [value, setValue] = useState(read)
  useEffect(() => {
    const listener = (): void => { setValue(read()) }
    return store.subscribe(listener)
  }, deps)
  return value
}


function readStoredEnabled(): boolean {
  try {
    return readEnabled(window.localStorage)
  } catch {
    return false
  }
}

const enabledStore = createStore(readStoredEnabled(), value => {
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, value ? '1' : '0')
  } catch {

  }
})


export function useSuggestEnabled(): boolean {
  return useSharedValue(enabledStore.get, enabledStore)
}


export function setSuggestEnabled(next: boolean): void {
  enabledStore.set(next)
}

const busyStore = createStore<string | null>(null)


export function useSuggestBusy(sessionId?: string): boolean {
  const read = (): boolean => sessionId === undefined ? busyStore.get() !== null : busyStore.get() === sessionId
  return useSharedValue(read, busyStore, [sessionId])
}


export function setSuggestBusy(sessionId: string | null): void {
  busyStore.set(sessionId)
}


export function clearSuggestBusy(sessionId: string): void {
  if (busyStore.get() !== sessionId) return
  setSuggestBusy(null)
}

const errorStore = createStore<string | null>(null)


export function useSuggestError(): string | null {
  return useSharedValue(errorStore.get, errorStore)
}


export function setSuggestError(next: string | null): void {
  errorStore.set(next)
}





const supportStore = createStore<FimSupportState>(initialFimSupportState)


export function useSuggestSupportState(): FimSupportState {
  return useSharedValue(supportStore.get, supportStore)
}


export function useSuggestSupported(): boolean {
  return fimSupportShown(useSuggestSupportState())
}


export function dispatchSupportEvent(event: FimSupportEvent): void {
  const current = supportStore.get()
  const next = fimSupportReducer(current, event)
  if (next === current) return
  supportStore.set(next)
}

const suggestionStore = createStore<SuggestionRecord | null>(null)


export function useSuggestion(): SuggestionRecord | null {
  return useSharedValue(suggestionStore.get, suggestionStore)
}


export function setSuggestion(next: SuggestionRecord | null): void {
  suggestionStore.set(next)
}




let lastAdoption: { sessionId: SessionId; draft: string; text: string } | null = null


export function markSuggestAdoption(adoption: { sessionId: SessionId; draft: string; text: string }): void {
  lastAdoption = adoption
}


export function clearSuggestAdoption(): void {
  lastAdoption = null
}


export function peekSuggestAdoption(): { sessionId: SessionId; draft: string; text: string } | null {
  return lastAdoption
}


function readStoredSensitivity(): TriggerSensitivity {
  try {
    return normalizeTriggerSensitivity(window.localStorage.getItem(SENSITIVITY_STORAGE_KEY))
  } catch {
    return DEFAULT_TRIGGER_SENSITIVITY
  }
}

const sensitivityStore = createStore<TriggerSensitivity>(readStoredSensitivity(), next => {
  try {
    window.localStorage.setItem(SENSITIVITY_STORAGE_KEY, next)
  } catch {

  }
})


export function useTriggerSensitivity(): TriggerSensitivity {
  return useSharedValue(sensitivityStore.get, sensitivityStore)
}


export function setTriggerSensitivity(next: TriggerSensitivity): void {
  sensitivityStore.set(next)
}
