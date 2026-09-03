/**
 * CodeBuddy Credits 设置卡片：挂在官方 settings.models.provider-card 槽位
 * （key = 本插件命名空间），渲染在设置 → 模型页的 CodeBuddy Credits 行上。
 * 交互对齐 DeepSeek 官方编辑器卡（ui-settings-models ProviderEditor）：
 * 标题行（显示名 + 路由 id）→ 「API Key」标签 + 密码输入（placeholder 随
 * 配置状态切换）→ 账号信息一行（企业/个人只在配置页展示）→ 取消/应用
 * footer。视觉 token 与官方一致（--dsw-alias-*，随 DSH 深浅主题自动切换）。
 * Key 只发给本机 host 路由存入 DSH 凭据库；企业策略错误原样透传展示。
 */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

const STATUS_URL = '/api/codebuddy-credits/status'
const KEY_URL = '/api/codebuddy-credits/key'

interface CardStatus {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string }
}

interface CardProps {
  t: (key: string, vars?: Record<string, string>) => string
}

/** 官方 editor 容器：填充模块面，圆角 12，内边距 14/16。 */
const editorStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  padding: '14px 16px',
  borderRadius: '12px',
  background: 'var(--dsw-alias-bg-module-platform)',
  width: '100%',
  boxSizing: 'border-box',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
}

const titleStyle: CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-primary)',
}

const routeStyle: CSSProperties = {
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const labelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '12px',
  lineHeight: '18px',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-secondary)',
}

const inputStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: '36px',
  padding: '0 12px',
  border: '1px solid var(--dsw-alias-border-l3)',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: '13px',
}

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-state-error-primary)',
}

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
}

/** 官方 footer 按钮：36px 胶囊。 */
const buttonBase: CSSProperties = {
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: '36px',
  padding: '0 14px',
  border: 'none',
  borderRadius: '18px',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '22px',
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  ...buttonBase,
  background: 'var(--dsw-alias-button-primary-fill)',
  color: 'var(--dsw-alias-label-primary-foreground)',
}

const secondaryButtonStyle: CSSProperties = {
  ...buttonBase,
  border: '0.5px solid var(--dsw-alias-border-l3)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
}

/** 官方 apiKeyFailure 的轻量镜像：可打印 ASCII（空格除外）。 */
const LEGAL_API_KEY = /^[\x21-\x7E]+$/

function keyFailure(draft: string): boolean {
  if (draft.length === 0) return false
  const value = draft.trim()
  if (value.length === 0) return true
  return !LEGAL_API_KEY.test(value)
}

/** 账号类型文案（/v2/accounts 的 type 字段实测为 ultimate/personal；未知值原样展示）。 */
function accountTypeLabel(t: CardProps['t'], raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (raw === 'enterprise' || raw === 'ultimate') return t('account.enterprise')
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

  const configured = status?.keyConfigured === true
  const illegal = keyFailure(draft)

  const save = async () => {
    const key = draft.trim()
    if (key.length === 0) {
      setMessageKind('error')
      setMessage(t('error.empty'))
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
        setMessageKind('error')
        setMessage(payload.error ?? t('error.saveFailed'))
        return
      }
      setDraft('')
      setMessageKind('info')
      setMessage(t('saved'))
      await load()
    } catch {
      setMessageKind('error')
      setMessage(t('error.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const account = status?.account

  return (
    <div style={editorStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>CodeBuddy Credits</span>
        <span style={routeStyle}>codebuddy-credits</span>
      </div>
      <div style={fieldStyle}>
        <span style={labelStyle}>{t('key.label')}</span>
        <input
          aria-label="CodeBuddy API Key"
          type="password"
          placeholder={configured ? t('key.stored') : t('key.placeholder')}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          disabled={busy}
          autoComplete="new-password"
          aria-invalid={illegal}
          style={inputStyle}
        />
        {illegal
          ? <p style={errorStyle}>{t('key.illegal')}</p>
          : null}
      </div>
      {configured
        ? (
          <p style={hintStyle}>
            {t('state.configured', {
              enterprise: account?.enterpriseName ?? '—',
              type: accountTypeLabel(t, account?.accountType) ?? '—',
            })}
          </p>
        )
        : null}
      {message !== undefined
        ? (
          <p style={messageKind === 'error' ? errorStyle : hintStyle}>
            {message}
          </p>
        )
        : null}
      <div style={actionsStyle}>
        <button
          type="button"
          onClick={() => { setDraft(''); setMessage(undefined) }}
          disabled={busy}
          style={secondaryButtonStyle}
        >
          {t('action.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || illegal}
          style={primaryButtonStyle}
        >
          {busy ? t('action.applying') : t('action.apply')}
        </button>
      </div>
    </div>
  )
}
