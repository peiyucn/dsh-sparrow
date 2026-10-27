/**
 * 额度入口的状态面：/status（含模型事实、Max 模式同步）与 /quota（展开面板才拉）。
 * 两条请求各有独立序号——共用会让并发请求互相作废、面板卡在「读取中」。
 * 模块级状态缓存让槽位重挂载（切会话/视图）时以旧值初始化，避免「空 → 出现」闪烁。
 */

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
  /** Max 模式（推理档位锁）状态，随 /status 下发。 */
  maxMode?: boolean
}

/** 模块级状态缓存：槽位重挂载时以它初始化。 */
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
  // 配额独立于 /status（图标出现不等配额请求），展开面板时才拉 /quota。
  const [quota, setQuota] = useState<QuotaView | undefined>(undefined)
  const [quotaError, setQuotaError] = useState<string | undefined>(undefined)
  // 两个加载器各自独立的请求序号（见文件头）。
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
      // 模型事实随 /status 刷入共享事实表（选择器模型行同源读取）。
      syncModelFacts(payload.models ?? [])
      // Max 模式状态随 /status 同步进共享 store（选择器档位面板同源读取）。
      if (payload.maxMode !== undefined) syncMaxMode(payload.maxMode)
    } catch {
      if (seq !== statusSeq.current) return
      setLoadError(t('indicator.loadFailed'))
    }
  }, [t])

  /** 展开面板时拉取配额（独立于 /status，不阻塞图标出现）。 */
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

  // 挂载即读状态；配置卡保存/清空 Key 广播的窗口事件与窗口重新聚焦都会触发刷新。
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
