/**
 * CodeBuddy Credits 设置卡片：挂在官方 settings.models.provider-card 槽位
 * （key = 本插件命名空间），渲染在设置 → 模型页的 CodeBuddy Credits 行上。
 * 结构与视觉 1:1 复刻官方 ProviderEditor（ui-settings-models）：标题行
 * （显示名 + 路由 id）→「API Key」标签 + 密码输入 → 账号信息一行 →
 * 取消/应用 footer。端点固定、模型目录随 Key 自动获取，无可自定义项，
 * 故不渲染官方那格「自定义设置」折叠区。样式照抄官方 ModelsSection.module.css。
 *
 * 官方行头「编辑」按钮对本命名空间只弹占位提示，已被 CSS 隐藏（保留「移除」）；
 * 编辑入口完全由本卡承担：Key 已配置时折叠成一行（账号信息 + 编辑按钮），
 * 点按钮才展开输入区。
 * Key 只发给本机 host 路由存入 DSH 凭据库；企业策略错误原样透传展示。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

const STATUS_URL = '/api/codebuddy-credits/status'
const KEY_URL = '/api/codebuddy-credits/key'
const REMOVE_URL = '/api/codebuddy-credits/remove-key'
/** 保存/清空 Key 后广播的窗口事件（对话页额度卡据此联动刷新）。 */
const STATUS_CHANGED_EVENT = 'codebuddy-credits-status-changed'

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

/** 与取消/应用同款胶囊（描边 36px），文字用错误红。 */
const dangerButtonStyle: CSSProperties = {
  ...buttonBase,
  border: '0.5px solid var(--dsw-alias-border-l3)',
  background: 'transparent',
  color: 'var(--dsw-alias-state-error-primary)',
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
  const rootRef = useRef<HTMLDivElement | null>(null)

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

  // 官方行头「编辑」按钮保持在官方原位：捕获阶段拦截其点击，改为展开我们
  // 自己的编辑器（stopPropagation 阻断官方编辑器打开）。按钮位置/样式都是
  // 官方的，行为归我们。setup 姿态没有行头，此监听自然不命中。
  useEffect(() => {
    const onClickCapture = (event: MouseEvent): void => {
      const target = event.target
      if (target === null || !(target instanceof Node) || rootRef.current === null) return
      const li = rootRef.current.closest('li')
      if (li === null) return
      const head = li.querySelector(':scope > div:first-child')
      if (head === null) return
      const actions = head.querySelector(':scope > span:last-child')
      if (actions === null) return
      const button = actions.querySelector('button:first-of-type')
      if (button === null) return
      if (button === target || button.contains(target)) {
        event.preventDefault()
        event.stopPropagation()
        // 双向开关：编辑态点击即收起（官方编辑按钮的 toggle 语义）。
        setEditing(value => !value)
      }
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

  // 首装 setup 姿态没有行头「编辑」按钮（官方占位编辑器是 li 的首个子 div 且
  // 无 span 子元素）：折叠会让卡片完全空掉，此姿态下自动展开一次。
  useEffect(() => {
    const li = rootRef.current?.closest('li')
    if (li === null || li === undefined) return
    const head = li.querySelector(':scope > div:first-child')
    if (head === null) return
    if (head.querySelector(':scope > span:last-child') === null) setEditing(true)
  }, [])

  // 任一信号（页面 join / 状态接口）确认已配置即折叠。
  const configured = status?.keyConfigured === true || ownerKeyConfigured === true
  // 状态未知（页面 join 尚未就绪、状态接口未返回）时不渲染任何内容——
  // 避免「先闪出输入区再折叠」。
  const pending = status === undefined && ownerKeyConfigured !== true
  // 与官方一致：默认折叠（有无 Key 都一样），「编辑」展开、取消收起。
  const showEditor = editing
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
      // 应用成功后保持展开：让用户看到加载出来的账号信息与「已保存」提示，
      // 关闭交给用户（编辑 toggle / 取消）。
      setMessageKind('info')
      setMessage(t('saved'))
      await load()
      // 通知对话页的额度卡联动刷新（出现/消失），无需刷新页面。
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
    // 官方语义：取消即收起编辑器（无论是否已配置）。
    setEditing(false)
  }

  /** 清空已保存的 Key（凭据与模型目录一起清掉；profile 保留，行头圆点转红）。 */
  const clearKey = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      const response = await fetch(REMOVE_URL, { method: 'POST' })
      if (!response.ok) {
        setMessageKind('error')
        setMessage(t('error.clearFailed'))
        return
      }
      setDraft('')
      setEditing(false)
      setMessageKind('info')
      setMessage(t('cleared'))
      await load()
      // 通知对话页的额度卡联动刷新（消失/出现），无需刷新页面。
      window.dispatchEvent(new Event(STATUS_CHANGED_EVENT))
    } catch {
      setMessageKind('error')
      setMessage(t('error.clearFailed'))
    } finally {
      setBusy(false)
    }
  }

  const account = status?.account
  const accountParts = [
    accountTypeLabel(t, account?.accountType),
    account?.enterpriseName,
  ].filter((part): part is string => part !== undefined)

  // 状态未知时渲染 0×0 隐藏锚点（不渲染 null）：拦截监听与 :has 锚点从首帧
  // 起就位——否则这个窗口期点官方「编辑」会把官方编辑器打开，造成双标题。
  // 折叠态同样只渲染隐藏锚点：行下不显示任何内容（与 DeepSeek 行一致，
  // 只有名称 + 圆点 + 编辑按钮），企业信息等点开编辑后在编辑器里看。
  if (pending || !showEditor) {
    return <div ref={rootRef} className="ccb-card-root" style={{ display: 'none' }} />
  }

  return (
    <div ref={rootRef} className="ccb-card-root" style={editorStyle}>
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
      {message !== undefined
        ? (
          <p style={messageKind === 'error' ? errorStyle : hintStyle}>
            {message}
          </p>
        )
        : null}
      <div style={actionsStyle}>
        {configured
          ? (
            <button
              type="button"
              onClick={() => void clearKey()}
              disabled={busy}
              style={{ ...dangerButtonStyle, marginRight: 'auto' }}
            >
              {t('action.clearKey')}
            </button>
          )
          : null}
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
    // 官方行头「编辑」按钮保留在官方原位（点击由本卡捕获阶段拦截，展开我们
    // 自己的编辑器），不再 CSS 隐藏。首装 setup 姿态下官方渲染的占位编辑器
    // 仍然隐藏：它是 li 的第一个 div 且无 rowActions 结构（span:last-child）。
    'li:has(.ccb-card-root) > div:first-child:not(:has(> span:last-child)) { display: none; }',
  ].join('\n')
  document.head.append(style)
}
