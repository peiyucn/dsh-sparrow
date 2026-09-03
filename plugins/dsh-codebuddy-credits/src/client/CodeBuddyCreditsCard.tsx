/**
 * CodeBuddy Credits 设置卡片：挂在官方 settings.models.provider-card 槽位
 * （key = 本插件命名空间），渲染在设置 → 模型页的 CodeBuddy Credits 行上。
 * 交互对齐 DeepSeek 官方行的极简姿态：只有 Key 输入 + 保存/移除，配置后
 * 显示账号信息一行（企业/个人账号信息只在配置页展示）。配额与模型列表
 * 不进这里（配额在聊天头部额度卡，模型列表随 Key 自动刷新）。
 * Key 只发给本机 host 路由存入 DSH 凭据库；企业策略错误原样透传展示。
 */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

const STATUS_URL = '/api/codebuddy-credits/status'
const KEY_URL = '/api/codebuddy-credits/key'
const REMOVE_URL = '/api/codebuddy-credits/remove-key'

interface CardStatus {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string }
}

interface CardProps {
  t: (key: string, vars?: Record<string, string>) => string
}

const inputStyle: CSSProperties = {
  flex: '1 1 200px',
  minWidth: 0,
  minHeight: '32px',
  boxSizing: 'border-box',
  padding: '0 10px',
  border: '1px solid var(--dsw-border-subtle, #d0d5dd)',
  borderRadius: '8px',
  background: 'var(--dsw-surface-subtle, transparent)',
  color: 'inherit',
  font: 'inherit',
  fontSize: '13px',
}

const buttonStyle: CSSProperties = {
  minHeight: '28px',
  padding: '0 12px',
  border: '1px solid var(--dsw-border-subtle, #d0d5dd)',
  borderRadius: '14px',
  background: 'var(--dsw-surface-subtle, transparent)',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '13px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
}

/** 账号类型文案（/v2/accounts 的 type 字段；未知值原样展示）。 */
function accountTypeLabel(t: CardProps['t'], raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (raw === 'enterprise') return t('account.enterprise')
  if (raw === 'personal') return t('account.personal')
  return raw
}

export function CodeBuddyCreditsCard({ t }: CardProps) {
  const [status, setStatus] = useState<CardStatus | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [messageKind, setMessageKind] = useState<'error' | 'info'>('info')

  const load = useCallback(async () => {
    try {
      const response = await fetch(STATUS_URL, { cache: 'no-store' })
      if (!response.ok) return
      setStatus(await response.json() as CardStatus)
    } catch {
      // 状态读取失败保持原状（离线/服务未就绪时卡片静默降级）。
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const fail = (text: string) => {
    setMessageKind('error')
    setMessage(text)
  }

  const save = async () => {
    const key = draft.trim()
    if (key.length === 0) {
      fail(t('error.empty'))
      return
    }
    setBusy(true)
    setMessage(undefined)
    try {
      const response = await fetch(KEY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        // 企业策略错误等原样透传（如 ip not in whitelist）
        fail(payload.error ?? t('error.saveFailed'))
        return
      }
      setDraft('')
      setMessageKind('info')
      setMessage(t('saved'))
      await load()
    } catch {
      fail(t('error.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      await fetch(REMOVE_URL, { method: 'POST' })
      setDraft('')
      await load()
    } catch {
      fail(t('error.removeFailed'))
    } finally {
      setBusy(false)
    }
  }

  const account = status?.account

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', padding: '10px 12px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
        <input
          aria-label="CodeBuddy API Key"
          type="password"
          placeholder={t('key.placeholder')}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          disabled={busy}
          autoComplete="new-password"
          style={inputStyle}
        />
        {status?.keyConfigured === true
          ? (
            <button type="button" onClick={() => void remove()} disabled={busy} style={buttonStyle}>
              {t('key.remove')}
            </button>
          )
          : (
            <button type="button" onClick={() => void save()} disabled={busy} style={buttonStyle}>
              {t('key.save')}
            </button>
          )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-text-secondary, #667085)' }}>
        {status?.keyConfigured === true
          ? (
            <span>
              {t('state.configured', {
                enterprise: account?.enterpriseName ?? '—',
                type: accountTypeLabel(t, account?.accountType) ?? '—',
              })}
            </span>
          )
          : (
            <span>
              {t('state.missing')}
            </span>
          )}
        {message !== undefined
          ? <span style={{ color: messageKind === 'error' ? 'var(--dsw-text-danger, #c62828)' : undefined }}>{message}</span>
          : null}
      </div>
    </div>
  )
}
