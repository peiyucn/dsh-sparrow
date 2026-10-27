/** CodeBuddy Credits 设置卡表单（同构官方 ProviderEditor）；DOM seam 见 ./settings-row.ts；Key 只发本机 host 路由。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatModelFacts } from './format.js'
import { BusyDot } from './BusyDot.js'
import { CLIENT_ACTION_TIMEOUT_MS, fetchLocal } from './fetch-timeout.js'
import { syncModelFacts, type ModelFactView } from './model-facts.js'
import { insertSavedNotice, isRowEditTrigger, shouldAutoExpandSetup } from './settings-row.js'
import { API_PREFIX } from '../constants.js'
import { CCB_CLASS } from './styles.js'

const STATUS_URL = `${API_PREFIX}/status`
const KEY_URL = `${API_PREFIX}/key`
const REMOVE_URL = `${API_PREFIX}/remove-key`
const REFRESH_URL = `${API_PREFIX}/refresh-models`
/** 保存/清空 Key 后广播的窗口事件（对话页额度卡据此联动刷新）。 */
const STATUS_CHANGED_EVENT = 'codebuddy-credits-status-changed'

interface CardStatus {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string }
  models?: ModelFactView[]
}

interface CardProps {
  t: (key: string, vars?: Record<string, string>) => string
  /** 官方页面 owner 共享：行头凭据 join 结果（初始渲染即可用，无需等状态接口）。 */
  keyConfigured?: boolean
}

/** 官方 apiKeyFailure 的轻量镜像：可打印 ASCII（空格除外）。 */
const LEGAL_API_KEY = /^[\x21-\x7E]+$/

function keyFailure(draft: string): boolean {
  if (draft.length === 0) return false
  const value = draft.trim()
  if (value.length === 0) return true
  return !LEGAL_API_KEY.test(value)
}

/** 账号类型文案（官方 type 为 enterprise/ultimate/personal；未知值原样展示）。 */
function accountTypeLabel(t: CardProps['t'], raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (raw === 'enterprise' || raw === 'ultimate') return t('account.enterprise')
  if (raw === 'personal') return t('account.personal')
  return raw
}

export function CodeBuddyProviderCard({ t, keyConfigured: ownerKeyConfigured }: CardProps) {
  const [status, setStatus] = useState<CardStatus | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNote, setRefreshNote] = useState<string | undefined>(undefined)
  const [refreshError, setRefreshError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [messageKind, setMessageKind] = useState<'error' | 'info'>('info')
  // 官方 savedProvider 同款：应用成功即关闭编辑器并显示绿色保存提示，直到下次编辑/取消。
  const [savedNotice, setSavedNotice] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetchLocal(STATUS_URL, { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json() as CardStatus
      setStatus(payload)
      // 设置卡读到的模型事实同样回写共享表（与额度卡/选择器同源）。
      syncModelFacts(payload.models ?? [])
    } catch {
      // 状态读取失败保持原状（离线/服务未就绪时卡片静默降级）。
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  /** 手动重新扫描可用模型：只走本插件 host 路由（只重拉本 provider 目录，不触碰其他 provider）。 */
  const refreshModels = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError(undefined)
    setRefreshNote(undefined)
    try {
      const response = await fetchLocal(REFRESH_URL, { method: 'POST' }, CLIENT_ACTION_TIMEOUT_MS)
      const payload = await response.json().catch(() => null) as
        { error?: string; changed?: boolean; models?: ModelFactView[] } | null
      if (!response.ok) {
        setRefreshError(payload?.error ?? t('models.failed'))
        return
      }
      const list = Array.isArray(payload?.models) ? payload.models : []
      // 手动刷新结果同步进共享事实表：选择器/额度卡不必等下一次 /status。
      syncModelFacts(list)
      setStatus(previous => previous === undefined ? previous : { ...previous, models: list })
      setRefreshNote(payload?.changed === true
        ? t('models.updated', { count: String(list.length) })
        : t('models.latest'))
    } catch {
      setRefreshError(t('models.failed'))
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, t])

  // 捕获阶段拦住官方行头「编辑」按钮（stopPropagation 阻断官方编辑器）；官方改结构时由 settings-row.ts 静默降级。
  useEffect(() => {
    const onClickCapture = (event: MouseEvent): void => {
      if (!isRowEditTrigger(rootRef.current, event.target)) return
      event.preventDefault()
      event.stopPropagation()
      // 双向开关：编辑态点击即收起（官方编辑按钮的 toggle 语义）。
      setEditing(value => !value)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

  // 编辑器打开即清掉绿色保存提示（官方语义：提示持续到下一次编辑）。
  useEffect(() => {
    if (editing) setSavedNotice(false)
  }, [editing])

  // 绿色保存提示插到 section 顶部（官方 savedProvider 位置）；无公开槽位只能 DOM 插入（见 settings-row.ts）。
  useEffect(() => {
    if (!savedNotice) return
    return insertSavedNotice(rootRef.current, t('saved.provider'))
  }, [savedNotice, t])

  // 首装 setup 姿态没有行头「编辑」按钮：折叠会让卡片完全空掉，自动展开一次。
  useEffect(() => {
    if (shouldAutoExpandSetup(rootRef.current)) setEditing(true)
  }, [])

  // 任一信号（页面 join / 状态接口）确认已配置即折叠；状态未知时不渲染任何内容，避免先闪出输入区。
  const configured = status?.keyConfigured === true || ownerKeyConfigured === true
  const pending = status === undefined && ownerKeyConfigured !== true
  const showEditor = editing
  const illegal = keyFailure(draft)

  const save = async () => {
    const key = draft.trim()
    // 未输入新 Key 时传空串：服务端用已存 Key 重拉模型目录与账号信息（reapply）。
    if (key.length === 0 && !configured) {
      setMessageKind('error')
      setMessage(t('error.empty'))
      return
    }
    setBusy(true)
    setMessage(undefined)
    try {
      const response = await fetchLocal(KEY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      }, CLIENT_ACTION_TIMEOUT_MS)
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        // 原样透传服务端错误（如企业策略 ip not in whitelist）。
        setMessageKind('error')
        setMessage(payload.error ?? t('error.saveFailed'))
        return
      }
      setDraft('')
      // 官方语义：应用成功即收起编辑器。
      setMessage(undefined)
      setSavedNotice(true)
      setEditing(false)
      await load()
      // 通知对话页额度卡联动刷新（出现/消失），无需刷新页面。
      window.dispatchEvent(new Event(STATUS_CHANGED_EVENT))
    } catch {
      setMessageKind('error')
      setMessage(t('error.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    setDraft('')
    setMessage(undefined)
    setSavedNotice(false)
    // 官方语义：取消即收起编辑器（无论是否已配置）。
    setEditing(false)
  }

  /** 清空已保存的 Key（凭据与模型目录一起清掉；profile 保留，行头圆点转红）。 */
  const clearKey = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      const response = await fetchLocal(REMOVE_URL, { method: 'POST' })
      if (!response.ok) {
        setMessageKind('error')
        setMessage(t('error.clearFailed'))
        return
      }
      setDraft('')
      setEditing(false)
      setSavedNotice(false)
      setMessage(undefined)
      await load()
      // 通知对话页额度卡联动刷新（清空后积分胶囊消失），无需刷新页面。
      window.dispatchEvent(new Event(STATUS_CHANGED_EVENT))
    } catch {
      setMessageKind('error')
      setMessage(t('error.clearFailed'))
    } finally {
      setBusy(false)
    }
  }

  const account = status?.account
  const models = status?.models ?? []
  const accountParts = [
    accountTypeLabel(t, account?.accountType),
    account?.enterpriseName,
  ].filter((part): part is string => part !== undefined)

  // 状态未知与折叠态都渲染 0×0 隐藏锚点（不是 null）：拦截监听与 :has 锚点须从首帧起就位，
  // 否则窗口期点官方「编辑」会打开官方编辑器、出现双标题；行下不显示任何内容。
  if (pending || !showEditor) {
    return <div ref={rootRef} className={`${CCB_CLASS.cardRoot} ${CCB_CLASS.cardRootHidden}`} />
  }

  return (
    <div ref={rootRef} className={`${CCB_CLASS.cardRoot} ${CCB_CLASS.cardEditor}`}>
      <div className={CCB_CLASS.cardHeader}>
        <span className={CCB_CLASS.cardTitle}>CodeBuddy Credits</span>
      </div>
      <div className={CCB_CLASS.cardField}>
        <span className={CCB_CLASS.cardLabel}>{t('key.label')}</span>
        <input
          aria-label="CodeBuddy API Key"
          className={CCB_CLASS.cardInput}
          type="password"
          placeholder={configured ? t('key.stored') : t('key.placeholder')}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          disabled={busy}
          autoComplete="new-password"
          aria-invalid={illegal}
        />
        {illegal ? <p className={CCB_CLASS.cardError}>{t('key.illegal')}</p> : null}
      </div>
      {configured && accountParts.length > 0
        ? (
          <p className={CCB_CLASS.cardHint}>
            {t('state.configured', { account: accountParts.join(' · ') })}
          </p>
        )
        : null}
      {message !== undefined
        ? <p className={messageKind === 'error' ? CCB_CLASS.cardError : CCB_CLASS.cardHint}>{message}</p>
        : null}
      {configured
        ? (
          <div className={CCB_CLASS.cardModels}>
            <div className={CCB_CLASS.cardModelsHeader}>
              <span className={CCB_CLASS.cardLabel}>{t('models.title')}</span>
              <button
                type="button"
                onClick={() => void refreshModels()}
                disabled={refreshing}
                className={`${CCB_CLASS.cardButton} ${CCB_CLASS.cardButtonRefresh}`}
              >
                {refreshing ? t('models.fetching') : t('models.fetch')}
              </button>
            </div>
            {status === undefined
              ? <BusyDot label={t('picker.trigger.loading')} className={CCB_CLASS.cardHint} />
              : models.length === 0
                ? <p className={CCB_CLASS.cardHint}>{t('models.empty')}</p>
                : models.map(model => (
                // 名称用服务端原始名（不带系数/free）；右侧为只读事实（系数 · 上下文长度）。
                <div key={model.id} className={CCB_CLASS.cardModelRow}>
                  <span className={CCB_CLASS.cardModelName} title={model.id}>{model.name}</span>
                  <span className={CCB_CLASS.cardModelFact}>{formatModelFacts(model)}</span>
                </div>
              ))}
            {refreshNote === undefined ? null : <p className={CCB_CLASS.cardHint}>{refreshNote}</p>}
            {refreshError === undefined ? null : <p className={CCB_CLASS.cardError}>{refreshError}</p>}
          </div>
        )
        : null}
      <div className={CCB_CLASS.cardActions}>
        {configured
          ? (
            <button
              type="button"
              onClick={() => void clearKey()}
              disabled={busy}
              className={`${CCB_CLASS.cardButton} ${CCB_CLASS.cardButtonDanger} ${CCB_CLASS.cardButtonClear}`}
            >
              {t('action.clearKey')}
            </button>
          )
          : null}
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className={`${CCB_CLASS.cardButton} ${CCB_CLASS.cardButtonSecondary}`}
        >
          {t('action.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || illegal}
          className={`${CCB_CLASS.cardButton} ${CCB_CLASS.cardButtonPrimary}`}
        >
          {busy ? t('action.applying') : t('action.apply')}
        </button>
      </div>
    </div>
  )
}
