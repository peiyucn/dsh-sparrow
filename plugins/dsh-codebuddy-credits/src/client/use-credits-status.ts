

import { useCallback, useEffect, useRef, useState } from 'react'
import { API_PREFIX } from '../constants.js'
import { fetchLocal } from './fetch-timeout.js'
import { syncMaxMode } from './maxMode.js'
import { syncModelFacts } from './model-facts.js'
import type { ModelFactView } from './model-facts.js'

const STATUS_URL = `${API_PREFIX}/status`
const QUOTA_URL = `${API_PREFIX}/quota`

export interface QuotaView {
  used: number
  limit: number
  remaining: number
  resetAt?: string
}

export interface StatusPayload {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string; enterpriseUserName?: string; nickname?: string }
  models: ModelFactView[]

  maxMode?: boolean
}


let cachedStatus: StatusPayload | undefined

export interface CreditsStatusState {
  status: StatusPayload | undefined
  loadError: string | undefined
  quota: QuotaView | undefined
  quotaError: string | undefined
}

export function useCreditsStatus(
  open: boolean,
  t: (key: string, vars?: Record<string, string>) => string,
): CreditsStatusState {
  const [status, setStatus] = useState<StatusPayload | undefined>(() => cachedStatus)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)

  const [quota, setQuota] = useState<QuotaView | undefined>(undefined)
  const [quotaError, setQuotaError] = useState<string | undefined>(undefined)

  const statusSeq = useRef(0)
  const quotaSeq = useRef(0)

  const loadStatus = useCallback(async () => {
    const seq = ++statusSeq.current
    setLoadError(undefined)
    try {
      const response = await fetchLocal(STATUS_URL, { cache: 'no-store' })
      if (seq !== statusSeq.current) return
      if (!response.ok) {
        setLoadError(t('indicator.loadFailed'))
        return
      }
      const payload = await response.json() as StatusPayload
      cachedStatus = payload
      setStatus(payload)

      syncModelFacts(payload.models ?? [])

      if (payload.maxMode !== undefined) syncMaxMode(payload.maxMode)
    } catch {
      if (seq !== statusSeq.current) return
      setLoadError(t('indicator.loadFailed'))
    }
  }, [t])


  const loadQuota = useCallback(async () => {
    const seq = ++quotaSeq.current
    setQuotaError(undefined)
    try {
      const response = await fetchLocal(QUOTA_URL, { method: 'POST', cache: 'no-store' })
      if (seq !== quotaSeq.current) return
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        setQuotaError(payload.error ?? t('indicator.loadFailed'))
        return
      }
      setQuota(await response.json() as QuotaView)
    } catch {
      if (seq !== quotaSeq.current) return
      setQuotaError(t('indicator.loadFailed'))
    }
  }, [t])


  useEffect(() => {
    void loadStatus()
    const onStatusChanged = () => { void loadStatus() }
    const onFocus = () => { void loadStatus() }
    window.addEventListener('codebuddy-credits-status-changed', onStatusChanged)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('codebuddy-credits-status-changed', onStatusChanged)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadStatus])

  useEffect(() => {
    if (!open) return
    void loadStatus()
    void loadQuota()
  }, [open, loadStatus, loadQuota])

  return { status, loadError, quota, quotaError }
}
