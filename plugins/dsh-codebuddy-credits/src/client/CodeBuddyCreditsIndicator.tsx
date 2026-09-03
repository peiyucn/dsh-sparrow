/**
 * CodeBuddy 额度小卡：挂在官方 conversation.session.header.actions 槽位
 * （kind=list，scope=session），渲染在会话头部操作区（聊天框右上角）。
 * 长条 CodeBuddy 文字 logo（lobehub/lobe-icons 的 codebuddy-text.svg，
 * fill=currentColor，随主题自动着色）点击展开面板：账号、本期额度
 * （进度条 + 已用/剩余 + 重置日期）、当前选中 CodeBuddy 模型的信息。
 * 全部颜色走 --dsw-alias-* / --dsw-elevation-* 官方 token，深浅主题自动。
 *
 * 当前选中模型读官方共享模型目录（ctx.modelDirectories，与模型选择器
 * 同一 store，含目录默认值兜底），目录不可用时退回 session 投影
 * （useProjection('modelSelection')）——都是框架公开 seam，不读私有状态。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'

const STATUS_URL = '/api/codebuddy-credits/status'

/** CodeBuddy Combine（color）组合 logo：lobehub/lobe-icons 的 Color（紫蓝渐变圆角方块）+ Text（字样）横排 lockup，来源 https://lobehub.com/icons/codebuddy。图标渐变保持品牌色，字样 fill=currentColor 随 DSH 主题着色。 */
const LOGO_SVG = '<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 90 24" xmlns="http://www.w3.org/2000/svg"><title>CodeBuddy</title><defs><radialGradient cx="0" cy="0" gradientTransform="matrix(-9.00009 -16 16 -9.00009 21 24.5)" gradientUnits="userSpaceOnUse" id="ccb-logo-gradient" r="1"><stop stop-color="#2EA99D"></stop><stop offset="1" stop-color="#6C4DFF"></stop></radialGradient></defs><path d="M18.821 0H5.18A5.179 5.179 0 000 5.179V18.82A5.179 5.179 0 005.179 24H18.82A5.179 5.179 0 0024 18.821V5.18A5.179 5.179 0 0018.821 0z" fill="url(#ccb-logo-gradient)"></path><path d="M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z" fill="#fff"></path><path d="M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z" fill="#fff"></path><g transform="translate(32 0)" fill="currentColor" fill-rule="evenodd"><path d="M13.9 18.777c0 .314.009.639.028.973.028.324.1.62.216.887.124.267.315.487.573.659.258.162.621.243 1.09.243.468 0 .827-.081 1.076-.243.258-.172.448-.392.573-.659a2.42 2.42 0 00.215-.887c.029-.334.043-.659.043-.973V12.91h2.796v6.253c0 1.68-.386 2.905-1.16 3.678-.765.772-1.946 1.159-3.543 1.159-1.597 0-2.783-.387-3.557-1.16-.774-.772-1.162-1.998-1.162-3.677V12.91H13.9v5.867zM49.797 17.01l1.77 1.454-1.77 1.455L44.045 24v-3.473l3.023-2.077-3.023-2.063v-3.472l5.752 4.095zM57 23.917h-5.504v-2.969H57v2.969z"></path><path clip-rule="evenodd" d="M5.704 12.831c1.874 0 3.393 1.36 3.393 3.228 0 .61-.163 1.183-.448 1.678a3.598 3.598 0 011.22 2.701c0 1.995-1.624 3.458-3.625 3.458H1.54V12.83h4.164zm-1.85 8.76h2.164c.341 0 .667-.141.9-.39a1.226 1.226 0 000-1.68 1.236 1.236 0 00-.9-.389H3.853v2.459zm0-4.457h1.785a.997.997 0 100-1.998H3.853v1.998zM26.293 12.908c3.024 0 5.474 2.443 5.475 5.455 0 3.013-2.451 5.456-5.475 5.456H22.36v-10.91h3.932zm-1.31 8.299h1.31a2.848 2.848 0 002.853-2.844 2.848 2.848 0 00-2.853-2.843h-1.31v5.687zM37.089 12.908c3.023 0 5.475 2.443 5.475 5.455 0 3.013-2.452 5.456-5.475 5.456h-3.933v-10.91h3.933zm-1.311 2.612v5.687h1.31a2.848 2.848 0 002.854-2.844 2.849 2.849 0 00-2.853-2.843h-1.311zM15.793 0c.728 0 1.4.144 2.015.432a4.605 4.605 0 011.582 1.17 5.419 5.419 0 011.043 1.77c.248.669.372 1.393.37 2.173s-.124 1.51-.372 2.188a5.45 5.45 0 01-1.043 1.755c-.44.502-.967.896-1.582 1.184a4.829 4.829 0 01-2.015.418c-.735 0-1.41-.14-2.025-.418a4.8 4.8 0 01-1.571-1.184 5.571 5.571 0 01-1.032-1.755 6.325 6.325 0 01-.37-2.188c0-.78.123-1.504.37-2.173a5.54 5.54 0 011.032-1.77A4.721 4.721 0 0115.793 0zm0 2.647c-.343 0-.671.075-.983.223a2.42 2.42 0 00-.803.599c-.231.26-.415.567-.551.92a3.19 3.19 0 00-.204 1.156c0 .418.068.803.204 1.156.136.353.32.66.552.92.231.26.499.465.802.613.312.14.64.209.983.209.344 0 .668-.07.972-.209.312-.148.583-.353.815-.613.24-.26.428-.567.563-.92.136-.353.204-.738.204-1.156 0-.418-.068-.803-.204-1.156a2.855 2.855 0 00-.563-.92 2.385 2.385 0 00-.815-.599 2.183 2.183 0 00-.972-.223z"></path><path d="M39.472 2.441h-3.403V8.65h3.403v2.441h-6.264V0h6.264v2.441zM9.252 2.69H6.476a2.849 2.849 0 00-2.854 2.842 2.848 2.848 0 002.854 2.843h2.776v2.613H6.476C3.452 10.988 1 8.545 1 5.532 1 2.52 3.452.077 6.476.077h2.776v2.612z"></path><path clip-rule="evenodd" d="M26.293.077c3.024 0 5.475 2.442 5.475 5.455s-2.451 5.456-5.475 5.456H22.36V.077h3.932zm-1.31 8.298h1.31a2.848 2.848 0 002.853-2.843 2.848 2.848 0 00-2.853-2.843h-1.31v5.686z"></path><path d="M42.63 6.53h-3.184V4.166h3.184v2.362z"></path></g></svg>'

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

/** 重置时间只展示到日：2026-09-26 00:00:00 → 2026-09-26（非零点整保留原样）。 */
function formatReset(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const match = /^(\d{4}-\d{2}-\d{2}) 00:00:00$/.exec(raw)
  return match === null ? raw : match[1]
}

/** 面板正文：label-secondary（caption 在深浅两主题下都偏淡，不可读）。 */
const captionStyle: CSSProperties = {
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary)',
}

const dangerStyle: CSSProperties = {
  ...captionStyle,
  color: 'var(--dsw-alias-state-error-primary)',
}

const dividerStyle: CSSProperties = {
  height: '1px',
  margin: '8px 0',
  background: 'var(--dsw-alias-border-l1)',
}

/** 面板材质对齐官方 Menu 卡片（--dsw-specific-menu + elevation token）。 */
const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: '280px',
  maxWidth: '360px',
  boxSizing: 'border-box',
  padding: '12px 14px',
  border: '0',
  borderRadius: '20px',
  background: 'var(--dsw-specific-menu)',
  '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
  boxShadow: 'var(--dsw-elevation-prominent)',
  color: 'var(--dsw-alias-label-primary)',
  zIndex: 1000,
  textAlign: 'left',
  fontFamily: 'inherit',
} as CSSProperties

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

  // 挂载即读取状态：未配置 Key 时不显示图标（无配置时对话页不该有标）。
  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

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
  // /v2/accounts 实测 type 为 ultimate（企业）/personal；enterprise 兼容旧形状。
  const accountText = account?.enterpriseName
    ?? (account?.accountType === 'enterprise' || account?.accountType === 'ultimate'
      ? t('account.enterprise')
      : account?.accountType === 'personal'
        ? t('account.personal')
        : undefined)

  const quota = status?.quota
  const ratio = quota !== undefined && quota.limit > 0
    ? Math.min(1, Math.max(0, quota.used / quota.limit))
    : 0
  const percent = Math.round(ratio * 100)
  const resetAt = formatReset(quota?.resetAt)

  // 未配置 Key（或状态未加载完成）时不渲染图标：对话页只在有 CodeBuddy
  // 配置时才出现这个标；加载完成后配置态自动亮出。
  if (status?.keyConfigured !== true) return null

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
          style={{ display: 'inline-flex', fontSize: 18, lineHeight: 1 }}
          dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
        />
      </button>
      {open
        ? (
          <div role="dialog" aria-label={t('indicator.title')} style={panelStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: '20px', marginBottom: '6px' }}>
              {t('indicator.title')}
            </div>
            {status === undefined && loadError === undefined
              ? <div style={captionStyle}>{t('indicator.loading')}</div>
              : null}
            {status?.keyConfigured === true
              ? (
                <>
                  {accountText !== undefined
                    ? <div style={captionStyle}>{accountText}</div>
                    : null}
                  {quota !== undefined
                    ? (
                      <>
                        {/* 容量条对齐 dsh-file-manage 配额条：加厚 16px、未使用区
                            45° 斜纹、文字居中叠加、business 蓝填充。 */}
                        <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '18px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' }}>
                          {t('indicator.quotaTitle')}
                        </div>
                        <div
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                          style={{
                            position: 'relative',
                            height: '16px',
                            marginTop: '6px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent 0px, transparent 5px, var(--dsw-alias-border-l1) 5px, var(--dsw-alias-border-l1) 7px)',
                            overflow: 'hidden',
                          }}
                        >
                          {quota.used > 0
                            ? (
                              <div style={{
                                height: '100%',
                                minWidth: '4px',
                                background: 'var(--dsw-alias-state-business-primary)',
                                transition: 'width 220ms ease-out',
                                width: percent + '%',
                              }} />
                            )
                            : null}
                          <span style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            lineHeight: '16px',
                            whiteSpace: 'nowrap',
                            color: 'var(--dsw-alias-label-primary)',
                            textShadow: '0 0 4px var(--dsw-alias-bg-layer-2)',
                            pointerEvents: 'none',
                          }}>
                            {t('indicator.used', {
                              used: quota.used.toFixed(2),
                              limit: quota.limit.toFixed(2),
                              percent: String(percent),
                            })}
                          </span>
                        </div>
                        <div style={{ ...captionStyle, marginTop: '6px' }}>
                          {t('indicator.remaining', { remaining: quota.remaining.toFixed(2) })}
                        </div>
                        {resetAt !== undefined
                          ? <div style={captionStyle}>{t('indicator.reset', { reset: resetAt })}</div>
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
                  <div style={{ ...captionStyle, marginBottom: '2px' }}>{t('indicator.model.title')}</div>
                  <div style={{ fontSize: '13px', lineHeight: '20px', fontWeight: 500 }}>{model.name}</div>
                  <div style={captionStyle}>{t('indicator.model.context', { context: formatTokens(model.contextWindow) })}</div>
                  {model.vision
                    ? <div style={captionStyle}>👁 {t('indicator.model.vision')}</div>
                    : null}
                  {model.efforts !== undefined && model.efforts.length > 0
                    ? <div style={captionStyle}>{t('indicator.model.efforts', { efforts: model.efforts.join(' / ') })}</div>
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
    '  height: 28px; padding: 0 8px;',
    '  border: none; border-radius: 8px;',
    '  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;',
    '}',
    '.ccb-indicator-button:hover {',
    '  background: var(--dsw-alias-interactive-bg-hover);',
    '  color: var(--dsw-alias-label-primary);',
    '}',
    '.ccb-indicator-button:focus-visible {',
    '  outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);',
    '}',
  ].join('\n')
  document.head.append(style)
}
