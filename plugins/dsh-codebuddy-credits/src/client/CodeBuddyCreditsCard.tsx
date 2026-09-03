/**
 * CodeBuddy Credits 设置卡片：挂在官方 settings.models.provider-card 槽位
 * （key = 本插件命名空间），渲染在设置 → 模型页的 CodeBuddy Credits 行上。
 * 结构与视觉 1:1 复刻官方 ProviderEditor（ui-settings-models）：标题行
 * （显示名 + 路由 id）→「API Key」标签 + 密码输入 → 账号信息一行 →
 * 「自定义设置」折叠区（Base URL 只读 + 模型目录说明）→ 取消/应用 footer。
 * 样式全部照抄官方 ModelsSection.module.css（--dsw-alias-* token）。
 *
 * 无法接管的是官方行头「编辑」按钮展开的那张官方卡（页面内组件、非槽位，
 * 对本命名空间只渲染占位提示）；本卡常驻在行内、与官方编辑器同款，Key
 * 已配置时折叠成一行（账号信息 + 更换 Key），点按钮才展开输入区。
 * Key 只发给本机 host 路由存入 DSH 凭据库；企业策略错误原样透传展示。
 */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

const STATUS_URL = '/api/codebuddy-credits/status'
const KEY_URL = '/api/codebuddy-credits/key'

/** 官方端点固定（协议层自建，不开放自定义 Base URL）。 */
const FIXED_BASE_URL = 'https://copilot.tencent.com/v2'

interface CardStatus {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string }
  models?: unknown[]
}

interface CardProps {
  t: (key: string, vars?: Record<string, string>) => string
  /** 官方页面 owner 共享：行头凭据 join 结果（初始渲染即可用，无需等状态接口）。 */
  keyConfigured?: boolean
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

/** 折叠态：一行状态 + 小号「更换 Key」（不渲染成第二个编辑器卡）。 */
const collapsedRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  padding: '8px 12px',
  borderRadius: '12px',
  background: 'var(--dsw-alias-bg-module-platform)',
  width: '100%',
  boxSizing: 'border-box',
}

const collapsedTextStyle: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary)',
}

const linkButtonStyle: CSSProperties = {
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  height: '28px',
  padding: '0 10px',
  border: 'none',
  borderRadius: '14px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-tertiary)',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  cursor: 'pointer',
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

export function CodeBuddyCreditsCard({ t, keyConfigured: ownerKeyConfigured }: CardProps) {
  const [status, setStatus] = useState<CardStatus | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
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

  // 任一信号（页面 join / 状态接口）确认已配置即折叠；两者都未知才展开输入区。
  const configured = status?.keyConfigured === true || ownerKeyConfigured === true
  const showEditor = !configured || editing
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
      setEditing(false)
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

  const cancel = () => {
    setDraft('')
    setMessage(undefined)
    if (configured) setEditing(false)
  }

  const account = status?.account
  const accountParts = [
    accountTypeLabel(t, account?.accountType),
    account?.enterpriseName,
  ].filter((part): part is string => part !== undefined)
  const modelCount = status?.models?.length ?? 0

  if (!showEditor) {
    return (
      <div style={collapsedRowStyle}>
        <p style={collapsedTextStyle}>
          {accountParts.length > 0
            ? t('state.configured', { account: accountParts.join(' · ') })
            : t('state.configuredShort')}
        </p>
        <button type="button" onClick={() => setEditing(true)} className="ccb-card-link" style={linkButtonStyle}>
          {t('key.replace')}
        </button>
      </div>
    )
  }

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
          className="ccb-card-input"
          type="password"
          placeholder={configured ? t('key.stored') : t('key.placeholder')}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          disabled={busy}
          autoComplete="new-password"
          aria-invalid={illegal}
        />
        {illegal
          ? <p style={errorStyle}>{t('key.illegal')}</p>
          : null}
      </div>
      {configured && accountParts.length > 0
        ? (
          <p style={hintStyle}>
            {t('state.configured', { account: accountParts.join(' · ') })}
          </p>
        )
        : null}
      {/* 官方编辑器的「自定义设置」折叠区（同款旋转箭头、同款分隔线）。 */}
      <details className="ccb-card-customized">
        <summary>{t('customized')}</summary>
        <div className="ccb-card-customizedBody">
          <div style={fieldStyle}>
            <span style={labelStyle}>{t('baseUrl')}</span>
            <input
              className="ccb-card-input"
              type="text"
              value={FIXED_BASE_URL}
              disabled
              readOnly
              aria-label={t('baseUrl')}
            />
          </div>
          <p style={hintStyle}>
            {t('models.auto', { count: String(modelCount) })}
          </p>
        </div>
      </details>
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
          onClick={cancel}
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

let cardStylesInstalled = false

/** 官方 ModelsSection.module.css 的 input/customized/linkButton 照抄（:focus 等伪类只能走样式表）。 */
export function ensureCardStyles(): void {
  if (cardStylesInstalled || typeof document === 'undefined') return
  cardStylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-card-input {',
    '  box-sizing: border-box; width: 100%; height: 32px; padding: 0 10px;',
    '  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 8px;',
    '  font: inherit; font-size: 14px; line-height: 22px;',
    '  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);',
    '}',
    '.ccb-card-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }',
    '.ccb-card-input::placeholder { color: var(--dsw-alias-label-dimmed); }',
    '.ccb-card-input:disabled { opacity: 0.6; cursor: default; }',
    '.ccb-card-link:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }',
    '.ccb-card-customized { border-top: 0.5px solid var(--dsw-alias-border-l2); padding-top: 10px; }',
    '.ccb-card-customized > summary {',
    '  display: flex; align-items: center; gap: 6px; width: fit-content;',
    '  padding: 2px 4px; margin-left: -4px; border-radius: 6px;',
    '  cursor: pointer; font-size: 12px; line-height: 18px; font-weight: 500;',
    '  color: var(--dsw-alias-label-secondary); list-style: none;',
    '}',
    '.ccb-card-customized > summary::-webkit-details-marker { display: none; }',
    '.ccb-card-customized > summary::before {',
    "  content: ''; width: 5px; height: 5px;",
    '  border-right: 1.5px solid currentcolor; border-bottom: 1.5px solid currentcolor;',
    '  transform: rotate(-45deg) translate(-1px, -1px); transition: transform 120ms ease;',
    '}',
    '.ccb-card-customized[open] > summary::before { transform: rotate(45deg) translate(-1px, -1px); }',
    '.ccb-card-customized > summary:hover { color: var(--dsw-alias-label-primary); }',
    '.ccb-card-customizedBody { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; }',
  ].join('\n')
  document.head.append(style)
}
