/**
 * CodeBuddy 额度小卡：挂在官方 conversation.session.header.actions 槽位
 * （kind=list，scope=session），渲染在会话头部操作区（聊天框右上角）。
 * logo 图标（lobehub/lobe-icons 的 codebuddy-color.svg）点击展开面板：
 * 账号、本期额度余额、重置周期，以及当前选中 CodeBuddy 模型的信息
 * （展示名含积分系数/视觉标记、上下文窗口、原生视觉、思考档位）。
 *
 * 当前选中模型读官方共享模型目录（ctx.modelDirectories，与模型选择器
 * 同一 store，含目录默认值兜底），目录不可用时退回 session 投影
 * （useProjection('modelSelection')）——都是框架公开 seam，不读私有状态。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'

const STATUS_URL = '/api/codebuddy-credits/status'

/** CodeBuddy 官方 logo（lobehub/lobe-icons，https://lobehub.com/icons/codebuddy）。 */
const LOGO_SVG = '<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M18.821 0H5.18A5.179 5.179 0 000 5.179V18.82A5.179 5.179 0 005.179 24H18.82A5.179 5.179 0 0024 18.821V5.18A5.179 5.179 0 0018.821 0z" fill="url(#lobe-icons-code-buddy-_R_0_)"></path><path d="M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z" fill="#fff"></path><path d="M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z" fill="#fff"></path><defs><radialGradient cx="0" cy="0" gradientTransform="matrix(-9.00009 -16 16 -9.00009 21 24.5)" gradientUnits="userSpaceOnUse" id="lobe-icons-code-buddy-_R_0_" r="1"><stop stop-color="#2EA99D"></stop><stop offset="1" stop-color="#6C4DFF"></stop></radialGradient></defs></svg>'

interface QuotaView {
  used: number
  limit: number
  remaining: number
  cycleStart?: string
  cycleEnd?: string
  resetAt?: string
}

interface ModelFactView {
  id: string
  name: string
  vision: boolean
  contextWindow: number
  maxTokens: number
  efforts?: string[]
}

interface StatusPayload {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string }
  quota?: QuotaView
  quotaError?: string
  models: ModelFactView[]
}

interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

interface ModelSelectionProjection {
  lastUsed: ModelSelection | null
  next: ModelSelection | null
}

/** 官方共享模型目录 store 的最小形状（@deepseek-ai/dsh-client-store 快照）。 */
interface DirectoryStore {
  getSnapshot(): { current: ModelSelection | null }
  subscribe(fn: () => void): () => void
}

export interface CodeBuddyCreditsIndicatorProps {
  t: (key: string, vars?: Record<string, string>) => string
  /** 框架注入的 SessionStandardProps（session scope 槽位）。 */
  sessionId: string
  useProjection: <K extends string>(key: K) => ModelSelectionProjection | undefined
  /** 插件注入：当前会话的共享模型目录 store（官方 ctx.modelDirectories）。 */
  directoryFor: (sessionId: string) => DirectoryStore | undefined
}

/** 上下文 token 数的人类可读缩写（192000 → 192K，1000000 → 1M）。 */
function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return (Number.isInteger(millions) ? String(millions) : millions.toFixed(1)) + 'M'
  }
  if (value >= 1000) {
    const thousands = value / 1000
    return (Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(0)) + 'K'
  }
  return String(value)
}

const mutedStyle: CSSProperties = {
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-text-secondary, #667085)',
}

const dangerStyle: CSSProperties = {
  ...mutedStyle,
  color: 'var(--dsw-text-danger, #c62828)',
}

const dividerStyle: CSSProperties = {
  height: '1px',
  margin: '8px 0',
  background: 'var(--dsw-border-subtle, #d0d5dd)',
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: '280px',
  maxWidth: '360px',
  boxSizing: 'border-box',
  padding: '12px 14px',
  border: '1px solid var(--dsw-border-subtle, #d0d5dd)',
  borderRadius: '12px',
  background: 'var(--dsw-surface-elevated, #ffffff)',
  color: 'var(--dsw-text-primary, #101828)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  zIndex: 1000,
  textAlign: 'left',
}

/** 面板内文本跟随 DSH 亮暗主题。 */
const panelFont: CSSProperties = { fontFamily: 'inherit' }

export function CodeBuddyCreditsIndicator({
  t,
  sessionId,
  useProjection,
  directoryFor,
}: CodeBuddyCreditsIndicatorProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<StatusPayload | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const requestSeq = useRef(0)

  // 当前选中模型：共享模型目录优先（与选择器同一 store，含目录默认兜底）；
  // 目录不可用（组合里没有 modelDirectories 服务）时退回 session 投影。
  const directory = useMemo(() => {
    try {
      return directoryFor(sessionId)
    } catch {
      return undefined
    }
  }, [sessionId, directoryFor])
  const subscribe = useCallback((fn: () => void): (() => void) => {
    if (directory === undefined) return () => {}
    return directory.subscribe(fn)
  }, [directory])
  const directoryCurrent = useSyncExternalStore(
    subscribe,
    () => (directory !== undefined ? directory.getSnapshot().current : null),
  )
  const projection = useProjection('modelSelection')
  const selection: ModelSelection | null = directoryCurrent ?? projection?.next ?? null

  const loadStatus = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoadError(undefined)
    try {
      const response = await fetch(STATUS_URL, { cache: 'no-store' })
      if (seq !== requestSeq.current) return
      if (!response.ok) {
        setLoadError(t('indicator.loadFailed'))
        return
      }
      setStatus(await response.json() as StatusPayload)
    } catch {
      if (seq !== requestSeq.current) return
      setLoadError(t('indicator.loadFailed'))
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    void loadStatus()
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, loadStatus])

  const selected = selection?.provider === 'codebuddy-credits' ? selection : undefined
  const model = selected === undefined
    ? undefined
    : status?.models.find(entry => entry.id === selected.model)

  const account = status?.account
  const accountText = account?.enterpriseName
    ?? (account?.accountType === 'enterprise'
      ? t('account.enterprise')
      : account?.accountType === 'personal'
        ? t('account.personal')
        : undefined)

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={t('indicator.open')}
        aria-expanded={open}
        title={t('indicator.open')}
        onClick={() => setOpen(value => !value)}
        className="ccb-indicator-button"
      >
        <span
          style={{ display: 'inline-flex', fontSize: 16, lineHeight: 1 }}
          dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
        />
      </button>
      {open
        ? (
          <div role="dialog" aria-label={t('indicator.title')} style={{ ...panelStyle, ...panelFont }}>
            <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: '20px', marginBottom: '4px' }}>
              {t('indicator.title')}
            </div>
            {status === undefined && loadError === undefined
              ? <div style={mutedStyle}>{t('indicator.loading')}</div>
              : null}
            {status?.keyConfigured === false
              ? <div style={mutedStyle}>{t('indicator.noKey')}</div>
              : null}
            {status?.keyConfigured === true
              ? (
                <>
                  {accountText !== undefined
                    ? <div style={mutedStyle}>{accountText}</div>
                    : null}
                  {status.quota !== undefined
                    ? (
                      <>
                        <div style={mutedStyle}>
                          {t('indicator.balance', {
                            used: status.quota.used.toFixed(2),
                            limit: status.quota.limit.toFixed(2),
                            remaining: status.quota.remaining.toFixed(2),
                          })}
                        </div>
                        {status.quota.resetAt !== undefined
                          ? <div style={mutedStyle}>{t('indicator.reset', { reset: status.quota.resetAt })}</div>
                          : null}
                      </>
                    )
                    : null}
                  {status.quotaError !== undefined
                    ? <div style={dangerStyle}>{status.quotaError}</div>
                    : null}
                </>
              )
              : null}
            {loadError !== undefined
              ? <div style={dangerStyle}>{loadError}</div>
              : null}
            {model !== undefined
              ? (
                <>
                  <div style={dividerStyle} />
                  <div style={{ ...mutedStyle, marginBottom: '2px' }}>{t('indicator.model.title')}</div>
                  <div style={{ fontSize: '13px', lineHeight: '20px', fontWeight: 500 }}>{model.name}</div>
                  <div style={mutedStyle}>{t('indicator.model.context', { context: formatTokens(model.contextWindow) })}</div>
                  {model.vision
                    ? <div style={mutedStyle}>{t('indicator.model.vision')}</div>
                    : null}
                  {model.efforts !== undefined && model.efforts.length > 0
                    ? <div style={mutedStyle}>{t('indicator.model.efforts', { efforts: model.efforts.join(' / ') })}</div>
                    : null}
                </>
              )
              : null}
          </div>
        )
        : null}
    </div>
  )
}

let stylesInstalled = false

/** 图标按钮的 hover/focus 样式（inline style 表达不了 :hover，注入一次）。 */
export function ensureIndicatorStyles(): void {
  if (stylesInstalled || typeof document === 'undefined') return
  stylesInstalled = true
  const style = document.createElement('style')
  style.textContent = [
    '.ccb-indicator-button {',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  width: 28px; height: 28px; padding: 0;',
    '  border: none; border-radius: 14px;',
    '  background: transparent; color: inherit; cursor: pointer;',
    '}',
    '.ccb-indicator-button:hover {',
    '  background: var(--dsw-surface-hover, rgba(0, 0, 0, 0.06));',
    '}',
    '.ccb-indicator-button:focus-visible {',
    '  outline: 2px solid var(--dsw-accent, #4d6bfe); outline-offset: 1px;',
    '}',
  ].join('\n')
  document.head.append(style)
}
