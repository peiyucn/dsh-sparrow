/**
 * CodeBuddy 额度入口：官方 conversation.session.header.utilities 槽位（order -10，排在 session log 按钮左侧）；
 * blank 会话 hero 态官方 header 隐藏，改经 conversation.input.dock 锚点读官方 data-phase 标记 portal 到会话根右上角。
 * 面板显示账号 / 本期额度 / 选中 CodeBuddy 模型；颜色全走 --dsw-* 官方 token；模型事实表见 ./model-facts.ts。
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { setMaxMode, subscribeMaxMode, getMaxMode, syncMaxMode } from './maxMode.js'
import { scopeMarkSvg } from './mark-ids.js'
import { BusyDot } from './BusyDot.js'
import { formatModelFacts } from './format.js'
import { fetchLocal } from './fetch-timeout.js'
import { PROFILE_URL, safeExternalHref } from './external-links.js'
import { PROVIDER_ID, syncModelFacts, type ModelFactView } from './model-facts.js'

const STATUS_URL = '/api/codebuddy-credits/status'
const QUOTA_URL = '/api/codebuddy-credits/quota'

/** hero 入口几何：量官方角按钮 `[data-conversation-header-corner]` 贴其左侧，取不到时退回固定 top/right。 */
const HERO_BADGE_FALLBACK_TOP_PX = 14
const HERO_BADGE_FALLBACK_RIGHT_PX = 28
const HERO_BADGE_GAP_PX = 8
/** 入口按钮高度（与 .ccb-indicator-button 的 28px 一致，用于与角按钮垂直居中）。 */
const INDICATOR_BUTTON_HEIGHT_PX = 28
const HEADER_CORNER_SELECTOR = '[data-conversation-header-corner]'

/** hero 入口的 portal 容器：必须是**拥有 `@container` 上下文**的元素（官方把 container-type 挂在 `.titleRow` 上；
 *  挂会话根会让窄化查询恒不命中，退化成不窄化）；角按钮须限定在本会话根内 query，多会话根并存会取错树。 */
function heroPortalTarget(rootEl: Element): Element {
  return rootEl.querySelector(HEADER_CORNER_SELECTOR)?.parentElement ?? rootEl
}

/** 面板标题 + 顶栏窄化态共用的方形渐变图标；上游 lobehub/lobe-icons 的 codebuddy-color.svg（独立渐变 id）。 */
export const MARK_SQUARE_SVG = '<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>CodeBuddy</title><defs><radialGradient cx="0" cy="0" gradientTransform="matrix(-9.00009 -16 16 -9.00009 21 24.5)" gradientUnits="userSpaceOnUse" id="ccb-logo-square-gradient" r="1"><stop stop-color="#2EA99D"></stop><stop offset="1" stop-color="#6C4DFF"></stop></radialGradient></defs><path d="M18.821 0H5.18A5.179 5.179 0 000 5.179V18.82A5.179 5.179 0 005.179 24H18.82A5.179 5.179 0 0024 18.821V5.18A5.179 5.179 0 0018.821 0z" fill="url(#ccb-logo-square-gradient)"></path><path d="M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z" fill="#fff"></path><path d="M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z" fill="#fff"></path></svg>'

/** chat-fim 同款橙色（dsh 告警琥珀 token + #d9822b 兜底）。 */
const CREDIT_ORANGE = 'var(--dsw-alias-state-warn-primary, #d9822b)'

/** 标记字号（px）：两种形态共用的唯一来源，样式表里的显示宽度也由它派生。 */
export const MARK_FONT_PX = 18

/** 顶栏窄化阈值（容器宽 px）：容器 ≤ 它时只剩方标。机制对齐官方 ui-agent-team 的 @container 480px，
 *  容器是官方 `.titleRow` 的匿名 container-type；656 为实测定值，改它必须重跑量测。 */
export const MARK_COLLAPSE_PX = 656

/** CodeBuddy Combine（color）横排 lockup（lobehub/lobe-icons）：渐变保持品牌色，字样 fill=currentColor 随 DSH 主题着色。 */
export const LOGO_SVG = '<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 90 24" xmlns="http://www.w3.org/2000/svg"><title>CodeBuddy</title><defs><radialGradient cx="0" cy="0" gradientTransform="matrix(-9.00009 -16 16 -9.00009 21 24.5)" gradientUnits="userSpaceOnUse" id="ccb-logo-gradient" r="1"><stop stop-color="#2EA99D"></stop><stop offset="1" stop-color="#6C4DFF"></stop></radialGradient></defs><path d="M18.821 0H5.18A5.179 5.179 0 000 5.179V18.82A5.179 5.179 0 005.179 24H18.82A5.179 5.179 0 0024 18.821V5.18A5.179 5.179 0 0018.821 0z" fill="url(#ccb-logo-gradient)"></path><path d="M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z" fill="#fff"></path><path d="M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z" fill="#fff"></path><g transform="translate(32 0)" fill="currentColor" fill-rule="evenodd"><path d="M13.9 18.777c0 .314.009.639.028.973.028.324.1.62.216.887.124.267.315.487.573.659.258.162.621.243 1.09.243.468 0 .827-.081 1.076-.243.258-.172.448-.392.573-.659a2.42 2.42 0 00.215-.887c.029-.334.043-.659.043-.973V12.91h2.796v6.253c0 1.68-.386 2.905-1.16 3.678-.765.772-1.946 1.159-3.543 1.159-1.597 0-2.783-.387-3.557-1.16-.774-.772-1.162-1.998-1.162-3.677V12.91H13.9v5.867zM49.797 17.01l1.77 1.454-1.77 1.455L44.045 24v-3.473l3.023-2.077-3.023-2.063v-3.472l5.752 4.095zM57 23.917h-5.504v-2.969H57v2.969z"></path><path clip-rule="evenodd" d="M5.704 12.831c1.874 0 3.393 1.36 3.393 3.228 0 .61-.163 1.183-.448 1.678a3.598 3.598 0 011.22 2.701c0 1.995-1.624 3.458-3.625 3.458H1.54V12.83h4.164zm-1.85 8.76h2.164c.341 0 .667-.141.9-.39a1.226 1.226 0 000-1.68 1.236 1.236 0 00-.9-.389H3.853v2.459zm0-4.457h1.785a.997.997 0 100-1.998H3.853v1.998zM26.293 12.908c3.024 0 5.474 2.443 5.475 5.455 0 3.013-2.451 5.456-5.475 5.456H22.36v-10.91h3.932zm-1.31 8.299h1.31a2.848 2.848 0 002.853-2.844 2.848 2.848 0 00-2.853-2.843h-1.31v5.687zM37.089 12.908c3.023 0 5.475 2.443 5.475 5.455 0 3.013-2.452 5.456-5.475 5.456h-3.933v-10.91h3.933zm-1.311 2.612v5.687h1.31a2.848 2.848 0 002.854-2.844 2.849 2.849 0 00-2.853-2.843h-1.311zM15.793 0c.728 0 1.4.144 2.015.432a4.605 4.605 0 011.582 1.17 5.419 5.419 0 011.043 1.77c.248.669.372 1.393.37 2.173s-.124 1.51-.372 2.188a5.45 5.45 0 01-1.043 1.755c-.44.502-.967.896-1.582 1.184a4.829 4.829 0 01-2.015.418c-.735 0-1.41-.14-2.025-.418a4.8 4.8 0 01-1.571-1.184 5.571 5.571 0 01-1.032-1.755 6.325 6.325 0 01-.37-2.188c0-.78.123-1.504.37-2.173a5.54 5.54 0 011.032-1.77A4.721 4.721 0 0115.793 0zm0 2.647c-.343 0-.671.075-.983.223a2.42 2.42 0 00-.803.599c-.231.26-.415.567-.551.92a3.19 3.19 0 00-.204 1.156c0 .418.068.803.204 1.156.136.353.32.66.552.92.231.26.499.465.802.613.312.14.64.209.983.209.344 0 .668-.07.972-.209.312-.148.583-.353.815-.613.24-.26.428-.567.563-.92.136-.353.204-.738.204-1.156 0-.418-.068-.803-.204-1.156a2.855 2.855 0 00-.563-.92 2.385 2.385 0 00-.815-.599 2.183 2.183 0 00-.972-.223z"></path><path d="M39.472 2.441h-3.403V8.65h3.403v2.441h-6.264V0h6.264v2.441zM9.252 2.69H6.476a2.849 2.849 0 00-2.854 2.842 2.848 2.848 0 002.854 2.843h2.776v2.613H6.476C3.452 10.988 1 8.545 1 5.532 1 2.52 3.452.077 6.476.077h2.776v2.612z"></path><path clip-rule="evenodd" d="M26.293.077c3.024 0 5.475 2.442 5.475 5.455s-2.451 5.456-5.475 5.456H22.36V.077h3.932zm-1.31 8.298h1.31a2.848 2.848 0 002.853-2.843 2.848 2.848 0 00-2.853-2.843h-1.31v5.686z"></path><path d="M42.63 6.53h-3.184V4.166h3.184v2.362z"></path></g></svg>'

interface QuotaView {
  used: number
  limit: number
  remaining: number
  cycleStart?: string
  cycleEnd?: string
  resetAt?: string
}


interface StatusPayload {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string; enterpriseUserName?: string; nickname?: string }
  models: ModelFactView[]
  /** Max 模式（推理档位锁）状态，随 /status 下发。 */
  maxMode?: boolean
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
  /** 框架注入的会话 id（utilities 槽位 SessionStandardProps）。 */
  sessionId?: string
  /** 框架注入的会话投影 hook（目录缺失时兜底当前选中模型）。 */
  useProjection?: <K extends string>(key: K) => ModelSelectionProjection | undefined
  /** 插件注入：当前会话的共享模型目录 store（官方 ctx.modelDirectories）。 */
  directoryFor: (sessionId: string) => DirectoryStore | undefined
  /** header 常驻入口（默认）/ blank 会话 hero 锚点。 */
  variant?: 'header' | 'hero'
}

/** 重置时间只展示到日：2026-09-26 00:00:00 → 2026-09-26（非零点整保留原样）。 */
function formatReset(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const match = /^(\d{4}-\d{2}-\d{2}) 00:00:00$/.exec(raw)
  return match === null ? raw : match[1]
}

/** 距重置日期的天数（不足一天按 1 天计；无效/已过返回 null）。 */
function daysUntil(date: string): number | null {
  const time = Date.parse(date.replace(' ', 'T'))
  if (Number.isNaN(time)) return null
  const days = Math.ceil((time - Date.now()) / 86_400_000)
  return days >= 1 ? days : null
}

/** 积分数字：整数不挂小数位（2000），非整数保留两位（0.41/1999.59）。 */
function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** 百分比文案：占比不足 1% 时保留三位小数（0.020%），否则取整。 */
function percentText(ratio: number): string {
  const percent = ratio * 100
  return percent < 1 ? percent.toFixed(3) : String(Math.round(percent))
}

/** 面板正文 12px；不用 caption —— 那档在深浅两主题下都偏淡、不可读。 */
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
  background: 'var(--dsw-alias-border-l1)',
}

/** 面板材质对齐官方 Menu 卡片（--dsw-specific-menu + elevation token）；flex 列 + 统一 gap 6px 保证行距一致，
 *  portal + fixed 定位在打开时算出：右缘对齐按钮、左缘钳制在会话区内（避免被左侧边栏压住）。 */
const panelStyle: CSSProperties = {
  position: 'fixed',
  boxSizing: 'border-box',
  padding: '12px 14px',
  border: '0',
  borderRadius: '20px',
  background: 'var(--dsw-specific-menu)',
  // --dsw-specific-menu 是半透明玻璃色：必须同规则内配对 backdrop-filter，否则背后文字透出来
  backdropFilter: 'var(--dsw-menu-backdrop-filter)',
  '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
  boxShadow: 'var(--dsw-elevation-prominent)',
  color: 'var(--dsw-alias-label-primary)',
  zIndex: 1000,
  textAlign: 'left',
  fontFamily: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
} as CSSProperties

const PANEL_MAX_WIDTH = 300
const PANEL_EDGE_GAP = 8

/** 模块级状态缓存：槽位重挂载（切会话/视图）时以它初始化，避免「空 → 出现」闪烁。 */
let cachedStatus: StatusPayload | undefined

/** hero 锚点落点解析：从隐藏锚 span 找官方会话根 `[data-phase]`（公开标记），仅 hero 相位可见——
 *  active 时 header 常驻入口已就位，settling 也不显示（延续会话可能 header 已可见，避免双份）。 */
function useHeroRoot(): {
  anchorRef: (el: HTMLSpanElement | null) => void
  rootEl: Element | null
  visible: boolean
} {
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const [rootEl, setRootEl] = useState<Element | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  // 回调 ref：锚 span 挂载后解析会话根（portal 容器 + 观察目标）。
  const setAnchor = useCallback((el: HTMLSpanElement | null): void => {
    anchorRef.current = el
    setRootEl(el?.closest('[data-phase]') ?? null)
  }, [])
  useEffect(() => {
    if (rootEl === null) return
    const read = (): void => { setPhase(rootEl.getAttribute('data-phase')) }
    read()
    const observer = new MutationObserver(read)
    observer.observe(rootEl, { attributes: true, attributeFilter: ['data-phase'] })
    return () => { observer.disconnect() }
  }, [rootEl])
  return { anchorRef: setAnchor, rootEl, visible: phase === 'hero' }
}

export function CodeBuddyCreditsIndicator({
  t,
  sessionId: headerSessionId,
  useProjection,
  directoryFor,
  variant = 'header',
}: CodeBuddyCreditsIndicatorProps) {
  const sessionId = headerSessionId ?? ''
  // hook 无条件调用（锚 span 只在 hero 变体渲染，header 变体零观察零开销）。
  const hero = useHeroRoot()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<StatusPayload | undefined>(() => cachedStatus)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  // 配额独立于 /status（图标出现不等配额请求），展开面板时才拉 /quota。
  const [quota, setQuota] = useState<QuotaView | undefined>(undefined)
  const [quotaError, setQuotaError] = useState<string | undefined>(undefined)
  const [point, setPoint] = useState<{
    top: number
    right: number
    width: number
  } | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  // hero 入口落点（相对 portal 容器 hero.rootEl）：null = 未量到，先用兜底几何。
  const [heroAnchor, setHeroAnchor] = useState<{ top: number; right: number } | null>(null)
  // 两个加载器各自独立的请求序号：共用一个会让并发请求互相作废，面板卡在「读取中」。
  const statusSeq = useRef(0)
  const quotaSeq = useRef(0)

  /**
   * 品牌标 SVG 的实例作用域：`fill="url(#id)"` 按文档序取第一个同名元素，窄档那份 `display:none` 时
   * 面板会引用到不可见定义 ⇒ 每个注入点（wide/narrow/panel）必须各自不同前缀，不能共用。
   */
  const markScope = useId()
  const markWideSvg = useMemo(() => scopeMarkSvg(LOGO_SVG, `ccb-logo-${markScope}-wide`), [markScope])
  const markNarrowSvg = useMemo(() => scopeMarkSvg(MARK_SQUARE_SVG, `ccb-logo-${markScope}-narrow`), [markScope])
  const markPanelSvg = useMemo(() => scopeMarkSvg(MARK_SQUARE_SVG, `ccb-logo-${markScope}-panel`), [markScope])

  // 选中模型：共享目录优先（含目录默认兜底），服务缺失时退回 session 投影。
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
  const projection = useProjection === undefined
    ? undefined
    : useProjection('modelSelection')
  const selection: ModelSelection | null = directoryCurrent ?? projection?.next ?? null

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

  /** 计算面板位置：右缘对齐按钮、左缘钳制在会话区（不够宽时收缩，绝不越过左缘）。 */
  const position = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    const conversationLeft = document.querySelector('[data-conversation-scroll]')?.getBoundingClientRect().left ?? 0
    const width = Math.min(PANEL_MAX_WIDTH, Math.max(0, rect.right - conversationLeft - PANEL_EDGE_GAP))
    setPoint({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
      width,
    })
  }, [])

  /** hero 入口落点：贴官方角按钮左侧留 HERO_BADGE_GAP_PX、与之垂直居中；滚动不改相对位置，
   *  故只在挂载、相位切换与尺寸变化时重算。 */
  const measureHeroAnchor = useCallback(() => {
    const frame = hero.rootEl?.getBoundingClientRect()
    if (frame === undefined) return
    const corner = document.querySelector(HEADER_CORNER_SELECTOR)?.getBoundingClientRect()
    if (corner !== undefined && corner.width > 0 && corner.height > 0) {
      setHeroAnchor({
        top: Math.max(0, corner.top - frame.top + (corner.height - INDICATOR_BUTTON_HEIGHT_PX) / 2),
        right: Math.max(0, frame.right - corner.left + HERO_BADGE_GAP_PX),
      })
      return
    }
    setHeroAnchor({ top: HERO_BADGE_FALLBACK_TOP_PX, right: HERO_BADGE_FALLBACK_RIGHT_PX })
  }, [hero.rootEl])

  useEffect(() => {
    if (variant !== 'hero' || hero.rootEl === null || !hero.visible) return
    measureHeroAnchor()
    window.addEventListener('resize', measureHeroAnchor)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measureHeroAnchor)
    if (observer !== undefined) {
      observer.observe(hero.rootEl)
      const corner = document.querySelector(HEADER_CORNER_SELECTOR)
      if (corner !== null) observer.observe(corner)
    }
    return () => {
      window.removeEventListener('resize', measureHeroAnchor)
      observer?.disconnect()
    }
  }, [variant, hero.rootEl, hero.visible, measureHeroAnchor])

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

  /**
   * 打开面板时必须**先量再画**：用 useLayoutEffect（不能用 useEffect）——`point` 关闭时不清空，
   * 被动效果在绘制后才跑 ⇒ 重开时会先闪一帧旧坐标再跳到正确位置。
   */
  useLayoutEffect(() => {
    if (!open) return
    position()
  }, [open, position])

  useEffect(() => {
    if (!open) return
    void loadStatus()
    void loadQuota()
    const onMouseDown = (event: MouseEvent) => {
      // portal 面板不在 rootRef 内：按面板类名豁免，其余点击关闭。
      const target = event.target
      if (target instanceof Element && target.closest('.ccb-indicator-panel') !== null) return
      if (!rootRef.current?.contains(target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [open, position, loadStatus, loadQuota])

  // hero 相位离开（header 常驻入口接管）时收起面板，否则面板停在旧锚点坐标上。
  useEffect(() => {
    if (variant === 'hero' && !hero.visible && open) setOpen(false)
  }, [variant, hero.visible, open])

  const selected = selection?.provider === PROVIDER_ID ? selection : undefined
  const model = selected === undefined
    ? undefined
    : status?.models.find(entry => entry.id === selected.model)

  // 只读事实（系数 · 上下文长度）：与设置清单、模型选择器同一口径；无事实时只显示模型名。
  const modelFactsText = formatModelFacts(model)

  const account = status?.account
  // /v2/accounts 的 type：ultimate（企业）/ personal，enterprise 兼容旧形状。
  const accountText = [
    account?.accountType === 'enterprise' || account?.accountType === 'ultimate'
      ? t('account.enterprise')
      : account?.accountType === 'personal'
        ? t('account.personal')
        : undefined,
    account?.enterpriseName,
  ].filter((part): part is string => part !== undefined).join(' · ') || undefined

  const userBadge = account?.enterpriseUserName !== undefined
    ? account.enterpriseUserName
      + (account.nickname !== undefined && account.nickname !== account.enterpriseUserName
        ? ' · ' + account.nickname
        : '')
    : account?.nickname

  // Max 模式开关：共享 store 同源（选择器锁定态联动）；写入乐观更新，失败回滚并提示。
  const maxMode = useSyncExternalStore(subscribeMaxMode, getMaxMode)
  const [maxBusy, setMaxBusy] = useState(false)
  const [maxError, setMaxError] = useState<string | undefined>(undefined)
  const toggleMaxMode = useCallback(() => {
    if (maxBusy) return
    setMaxBusy(true)
    setMaxError(undefined)
    void setMaxMode(!maxMode)
      .catch(() => { setMaxError(t('indicator.max.failed')) })
      .finally(() => { setMaxBusy(false) })
  }, [maxBusy, maxMode, t])

  const ratio = quota !== undefined && quota.limit > 0
    ? Math.min(1, Math.max(0, quota.used / quota.limit))
    : 0
  const percent = Math.round(ratio * 100)
  const percentLabel = percentText(ratio)
  const resetAt = formatReset(quota?.resetAt)
  const resetDays = resetAt === undefined ? null : daysUntil(resetAt)

  const setRoot = useCallback((el: HTMLElement | null) => { rootRef.current = el }, [])

  // 未配置 Key（或状态未加载完成）时不渲染图标。
  if (status?.keyConfigured !== true) return null

  // 会话头部 logo 胶囊：header 变体挂官方 utilities 槽位（session log 按钮左边）；
  // hero 变体 portal 到会话根右上角（absolute 几何对齐 header 行）。
  const triggerButton = (
    <button
      type="button"
      aria-label={t('indicator.open')}
      aria-expanded={open}
      title={t('indicator.open')}
      onClick={() => setOpen(value => !value)}
      className="ccb-indicator-button"
    >
      {/* 两种形态都渲染、显隐交给样式表 @container：这里不能写内联 display —— 优先级更高，
          会让 @container 里的 display:none 永不生效。 */}
      <span
        className="ccb-mark-wide"
        style={{ fontSize: MARK_FONT_PX, lineHeight: 1 }}
        dangerouslySetInnerHTML={{ __html: markWideSvg }}
      />
      <span
        className="ccb-mark-narrow"
        style={{ fontSize: MARK_FONT_PX, lineHeight: 1 }}
        dangerouslySetInnerHTML={{ __html: markNarrowSvg }}
      />
    </button>
  )

  const trigger = (
    <div
      ref={setRoot}
      style={variant === 'hero'
        ? {
            position: 'absolute',
            top: heroAnchor?.top ?? HERO_BADGE_FALLBACK_TOP_PX,
            right: heroAnchor?.right ?? HERO_BADGE_FALLBACK_RIGHT_PX,
            display: 'inline-flex',
            zIndex: 7,
          }
        : { position: 'relative', display: 'inline-flex' }}
    >
      {triggerButton}
    </div>
  )

  // hero 变体：相位非 hero 或会话根尚未解析（锚 span 刚挂载）时不渲染入口。
  const heroHidden = variant === 'hero' && (!hero.visible || hero.rootEl === null)

  return (
    <>
      {/* hero 锚 span：display:none 占位（closest 仍有效）；必须常驻——不渲染时回调 ref 收不到元素。 */}
      {variant === 'hero'
        ? <span ref={hero.anchorRef} style={{ display: 'none' }} aria-hidden="true" />
        : null}
      {heroHidden
        ? null
        : variant === 'hero' && hero.rootEl !== null
          /* ⚠️ portal 容器必须是拥有 @container 上下文的那一个（见 heroPortalTarget），
             挂会话根会让窄化查询恒不命中。 */
          ? createPortal(trigger, heroPortalTarget(hero.rootEl))
          : trigger}
      {open && point !== null
        ? createPortal(
          <div
            className="ccb-indicator-panel"
            role="dialog"
            aria-label={t('indicator.title')}
            style={{
              ...panelStyle,
              top: point.top,
              right: point.right,
              width: point.width,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, lineHeight: '18px', marginBottom: '6px' }}>
              <span style={{ display: 'inline-flex', flex: '0 0 auto', fontSize: 16, lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: markPanelSvg }} />
              {/* 标题不换行：放不下时省略号截断，把空间让给徽章。 */}
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t('indicator.title')}
              </span>
              {userBadge !== undefined
                ? (
                  // 用户徽章即链接：新标签打开 CodeBuddy 个人主页（固定常量 URL，经 safeExternalHref 校验）。
                  <a
                    href={safeExternalHref(PROFILE_URL)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('indicator.profile')}
                    style={{
                      marginLeft: 'auto',
                      flex: '0 0 auto',
                      padding: '0 6px',
                      borderRadius: '4px',
                      background: 'var(--dsw-alias-interactive-bg-hover)',
                      color: 'var(--dsw-alias-label-secondary)',
                      fontSize: '12px',
                      lineHeight: '18px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {userBadge}
                  </a>
                )
                : null}
            </div>
            {status === undefined && loadError === undefined
              ? <BusyDot label={t('indicator.loading')} style={captionStyle} />
              : null}
            {status?.keyConfigured === true
              ? (
                <>
                  {accountText !== undefined
                    ? <div style={captionStyle}>{accountText}</div>
                    : null}
                  {quota === undefined && quotaError === undefined
                    ? <BusyDot label={t('indicator.loading')} style={captionStyle} />
                    : null}
                  {quota !== undefined
                    ? (
                      <>
                        {/* 容量条对齐 dsh-file-manage：16px 厚、45° 斜纹未使用区、文字居中叠加、
                            填充用 --dsw-alias-button-info-hover。 */}
                        <div style={{ fontSize: '12px', lineHeight: '18px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' }}>
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
                            borderRadius: '8px',
                            backgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent 0px, transparent 5px, var(--dsw-alias-border-l1) 5px, var(--dsw-alias-border-l1) 7px)',
                            overflow: 'hidden',
                          }}
                        >
                          {quota.used > 0
                            ? (
                              <div
                                className="ccb-quota-fill"
                                style={{
                                  height: '100%',
                                  minWidth: '4px',
                                  transition: 'width 220ms ease-out',
                                  width: percent + '%',
                                }}
                              />
                            )
                            : null}
                          <span style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            lineHeight: '16px',
                            whiteSpace: 'nowrap',
                            color: 'var(--dsw-alias-label-primary)',
                            textShadow: '0 0 4px var(--dsw-alias-bg-layer-2)',
                            pointerEvents: 'none',
                          }}>
                            {t('indicator.used', {
                              used: formatCredits(quota.used),
                              limit: formatCredits(quota.limit),
                              percent: percentLabel,
                            })}
                          </span>
                        </div>
                        <div style={captionStyle}>
                          {t('indicator.remainingLabel')}{' '}
                          <span style={{ color: CREDIT_ORANGE, fontWeight: 600 }}>{formatCredits(quota.remaining)}</span>
                        </div>
                        {resetAt !== undefined
                          ? (
                            <div style={captionStyle}>
                              {t('indicator.reset', { reset: resetAt })}
                              {resetDays !== null
                                ? ' ' + t('indicator.resetDays', { days: String(resetDays) })
                                : ''}
                            </div>
                          )
                          : null}
                      </>
                    )
                    : null}
                  {quotaError !== undefined
                    ? <div style={dangerStyle}>{quotaError}</div>
                    : null}
                </>
              )
              : null}
            {loadError !== undefined
              ? <div style={dangerStyle}>{loadError}</div>
              : null}
            {/* Max 模式（推理档位锁）：模型卡上方独立一行；锁开后所有推理模型请求强制 max 档。 */}
            {status?.keyConfigured === true
              ? (
                <>
                  <div style={dividerStyle} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontSize: '12px', lineHeight: '18px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>
                      {t('indicator.max.title')}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={maxMode}
                      aria-label={t('indicator.max.title')}
                      title={t('indicator.max.hint')}
                      disabled={maxBusy}
                      onClick={toggleMaxMode}
                      className={maxMode ? 'ccb-max-switch ccb-max-switch-on' : 'ccb-max-switch'}
                    >
                      <span className="ccb-max-knob" />
                    </button>
                  </div>
                  {maxError !== undefined
                    ? <div style={dangerStyle}>{maxError}</div>
                    : null}
                </>
              )
              : null}
            {model !== undefined
              ? (
                <>
                  <div style={dividerStyle} />
                  {/* 模型卡：加粗名 + 右侧只读事实（系数 · 上下文长度）→ 描述 → 可用功能。 */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>
                      {model.name}
                    </span>
                    {modelFactsText === undefined
                      ? null
                      : (
                        <span style={{ flex: '0 0 auto', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {modelFactsText}
                        </span>
                      )}
                  </div>
                  {model.description !== undefined
                    ? <div style={captionStyle}>{model.description}</div>
                    : null}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={captionStyle}>{t('indicator.model.features')}</span>
                    <span style={{ fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }}>
                      {[
                        model.vision ? t('indicator.model.visionFeature') : null,
                        model.efforts !== undefined && model.efforts.length > 0 ? t('indicator.model.reasoningFeature') : null,
                      ].filter((item): item is string => item !== null).join(' · ')}
                    </span>
                  </div>
                </>
              )
              : null}
            {/* 品牌行：-6px 底距抵消面板 12px 内边距，使上下边距对称。 */}
            <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: '2px', marginBottom: '-6px', textAlign: 'center', fontSize: 11, lineHeight: '14px', color: 'var(--dsw-alias-label-tertiary)' }}>
              🐦 dsh-sparrow
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}

export interface CodeBuddyCreditsHeroAnchorProps {
  t: (key: string, vars?: Record<string, string>) => string
  /** 框架注入的会话 id（SessionStandardProps）。 */
  sessionId?: string
  /** conversation.input.dock 的 InputZone owner 份额（兜底会话 id 来源）。 */
  session?: { sessionId?: unknown }
  /** 框架注入的会话投影 hook（透传给额度入口）。 */
  useProjection?: <K extends string>(key: K) => ModelSelectionProjection | undefined
  /** 插件注入：当前会话的共享模型目录 store（官方 ctx.modelDirectories）。 */
  directoryFor: (sessionId: string) => DirectoryStore | undefined
}

/** blank 会话 hero 锚点：把额度入口挂到官方 conversation.input.dock 槽位（公开 seam，
 *  hero/active 两态都渲染；本组件零可见输出，实际入口按 data-phase 决定是否 portal）。 */
export function CodeBuddyCreditsHeroAnchor({
  t,
  sessionId,
  session,
  useProjection,
  directoryFor,
}: CodeBuddyCreditsHeroAnchorProps) {
  const zoneSessionId = typeof session?.sessionId === 'string' ? session.sessionId : undefined
  const resolved = typeof sessionId === 'string' ? sessionId : zoneSessionId ?? ''
  return (
    <CodeBuddyCreditsIndicator
      variant="hero"
      t={t}
      sessionId={resolved}
      useProjection={useProjection}
      directoryFor={directoryFor}
    />
  )
}

let stylesInstalled = false

/**
 * 图标按钮的 hover/focus 样式 + 顶栏窄化（inline style 表达不了 :hover 与容器查询，注入一次）。
 * ⚠️ 两形态的 display 只在这里给：JSX 行内 display 优先级更高，会让 @container 的 display:none 永不生效。
 */
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
    // 两形态的默认显隐：宽屏给横排 lockup，方标收起。
    '.ccb-mark-wide { display: inline-flex; }',
    '.ccb-mark-narrow { display: none; }',
    // 容器 ≤ MARK_COLLAPSE_PX：横排放不下 ⇒ 只剩彩色方标，内边距同收一档（方标是方形，8px 占比偏大）。
    `@container (max-width: ${MARK_COLLAPSE_PX}px) {`,
    '  .ccb-mark-wide { display: none; }',
    '  .ccb-mark-narrow { display: inline-flex; }',
    '  .ccb-indicator-button { padding: 0 5px; }',
    '}',
    '.ccb-indicator-button:hover {',
    '  background: var(--dsw-alias-interactive-bg-hover);',
    '  color: var(--dsw-alias-label-primary);',
    '}',
    '.ccb-indicator-button:focus-visible {',
    '  outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);',
    '}',
    // 进度条填充用官方发送按钮 hover 色（--dsw-alias-button-info-hover，随主题自动切换）。
    '.ccb-quota-fill { background: var(--dsw-alias-button-info-hover); }',
    // Max 档位开关：开启色同进度条填充。
    '.ccb-max-switch { position: relative; flex: 0 0 auto; width: 28px; height: 16px; padding: 0; border: none; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover); cursor: pointer; transition: background 120ms ease; }',
    '.ccb-max-switch:disabled { cursor: default; opacity: 0.6; }',
    '.ccb-max-switch:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }',
    '.ccb-max-switch-on { background: var(--dsw-alias-button-info-hover); }',
    '.ccb-max-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--dsw-alias-label-primary, #fff); transition: transform 120ms ease; }',
    '.ccb-max-switch-on .ccb-max-knob { transform: translateX(12px); }',
  ].join('\n')
  document.head.append(style)
}
