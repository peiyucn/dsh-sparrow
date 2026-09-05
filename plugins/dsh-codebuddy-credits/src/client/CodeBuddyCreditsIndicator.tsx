/**
 * CodeBuddy 额度入口：挂在官方 conversation.session.header.utilities 槽位
 * （kind=list，scope=session；session log 下载按钮同槽位，本插件 order -10
 * 渲染在其左边）。点击展开面板：账号、本期额度（进度条 + 已用/剩余 +
 * 重置日期）、当前选中 CodeBuddy 模型的信息。全部颜色走 --dsw-alias-* /
 * --dsw-elevation-* 官方 token，深浅主题自动。
 *
 * 当前选中模型读官方共享模型目录（ctx.modelDirectories，与模型选择器
 * 同一 store，含目录默认值兜底），目录不可用时退回 session 投影
 * （useProjection('modelSelection')）——都是框架公开 seam，不读私有状态。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'

const STATUS_URL = '/api/codebuddy-credits/status'
const QUOTA_URL = '/api/codebuddy-credits/quota'

/** 面板标题用的方形渐变图标（Combine 里取出的 Color 单块，独立渐变 id）。 */
const SQUARE_LOGO_SVG = '<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>CodeBuddy</title><defs><radialGradient cx="0" cy="0" gradientTransform="matrix(-9.00009 -16 16 -9.00009 21 24.5)" gradientUnits="userSpaceOnUse" id="ccb-logo-square-gradient" r="1"><stop stop-color="#2EA99D"></stop><stop offset="1" stop-color="#6C4DFF"></stop></radialGradient></defs><path d="M18.821 0H5.18A5.179 5.179 0 000 5.179V18.82A5.179 5.179 0 005.179 24H18.82A5.179 5.179 0 0024 18.821V5.18A5.179 5.179 0 0018.821 0z" fill="url(#ccb-logo-square-gradient)"></path><path d="M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z" fill="#fff"></path><path d="M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z" fill="#fff"></path></svg>'

/** chat-fim 同款橙色（dsh 告警琥珀 token + #d9822b 兜底）。 */
const CREDIT_ORANGE = 'var(--dsw-alias-state-warn-primary, #d9822b)'

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
  /** 积分系数短串（"x0.79"），服务端未声明时缺省——消耗速度行用。 */
  credits?: string
  vision: boolean
  contextWindow: number
  maxTokens: number
  description?: string
  efforts?: string[]
}

interface StatusPayload {
  keyConfigured: boolean
  account?: { enterpriseName?: string; accountType?: string; enterpriseUserName?: string; nickname?: string }
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
  /** 会话头部 utilities 槽位（session 作用域，框架注入 SessionStandardProps）。 */
  sessionId?: string
  /** 框架注入的会话投影 hook（目录缺失时兜底当前选中模型）。 */
  useProjection?: <K extends string>(key: K) => ModelSelectionProjection | undefined
  /** 插件注入：当前会话的共享模型目录 store（官方 ctx.modelDirectories）。 */
  directoryFor: (sessionId: string) => DirectoryStore | undefined
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

/** 面板正文：统一 12px（与进度条内文字同号），
 * label-secondary（caption 在深浅两主题下都偏淡，不可读）。 */
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

/** 面板材质对齐官方 Menu 卡片（--dsw-specific-menu + elevation token）。
 * flex 列 + 统一 gap 6px：所有行间距一致，子元素不再各自设 margin。
 * 定位在打开时计算（portal + fixed）：右缘对齐按钮、左缘钳制在会话区内，
 * 避免面板伸进左侧边栏被压住。 */
const panelStyle: CSSProperties = {
  position: 'fixed',
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
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
} as CSSProperties

/** 面板最大宽度：会话区足够宽时的上限。 */
const PANEL_MAX_WIDTH = 300
/** 面板与会话区左缘的最小间距。 */
const PANEL_EDGE_GAP = 8

/** 模块级状态缓存：槽位重挂载（切会话/视图）时以它初始化，避免「空 → 出现」闪烁。 */
let cachedStatus: StatusPayload | undefined

export function CodeBuddyCreditsIndicator({
  t,
  sessionId: headerSessionId,
  useProjection,
  directoryFor,
}: CodeBuddyCreditsIndicatorProps) {
  const sessionId = headerSessionId ?? ''
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<StatusPayload | undefined>(() => cachedStatus)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  // 配额独立于状态接口：/status 保持毫秒级（图标出现不等待配额网络请求），
  // 展开面板时才拉 /quota。
  const [quota, setQuota] = useState<QuotaView | undefined>(undefined)
  const [quotaError, setQuotaError] = useState<string | undefined>(undefined)
  // 面板定位（打开时计算，滚动/缩放跟随重定位）：
  // header 变体右缘对齐按钮、左缘钳制在会话区；sidebar 变体从按钮右上展开、
  // 左缘钳制在会话区左缘（侧栏按钮在会话区之外，右对齐公式不适用）。
  const [point, setPoint] = useState<{
    top?: number
    right?: number
    left?: number
    bottom?: number
    width: number
  } | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  // 两个加载器各自独立的请求序号：共享一个序号会让并发请求互相作废——展开
  // 面板时 status/quota 同时发出，先发者的响应会被后发者的序号增长丢弃，
  // 面板一直停在「读取中」（实测）。各自维护序号，只作废自己这条流里被
  // 更新的旧响应。
  const statusSeq = useRef(0)
  const quotaSeq = useRef(0)

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
  const projection = useProjection === undefined
    ? undefined
    : useProjection('modelSelection')
  const selection: ModelSelection | null = directoryCurrent ?? projection?.next ?? null

  const loadStatus = useCallback(async () => {
    const seq = ++statusSeq.current
    setLoadError(undefined)
    try {
      const response = await fetch(STATUS_URL, { cache: 'no-store' })
      if (seq !== statusSeq.current) return
      if (!response.ok) {
        setLoadError(t('indicator.loadFailed'))
        return
      }
      const payload = await response.json() as StatusPayload
      cachedStatus = payload
      setStatus(payload)
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
      const response = await fetch(QUOTA_URL, { method: 'POST', cache: 'no-store' })
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

  /** 计算面板位置：右缘对齐按钮、左缘钳制在会话区（空间不足允许
   *  收缩，绝不越过会话区左缘）。 */
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

  // 挂载即读取状态：未配置 Key 时不显示图标（无配置时对话页不该有标）。
  // 配置卡保存/清空 Key 会广播窗口事件，此处联动刷新（无需刷新页面）；
  // 窗口重新获得焦点时也刷一次（兜底外部变更）。
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
    position()
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

  const selected = selection?.provider === 'codebuddy-credits' ? selection : undefined
  const model = selected === undefined
    ? undefined
    : status?.models.find(entry => entry.id === selected.model)

  // 消耗速度（积分倍率）：x0.51 → 0.51x 倍率；x0 → 免费；无声明 → –。
  const rateText = (() => {
    if (model === undefined || model.credits === undefined) return '–'
    const match = /^x([\d.]+)$/i.exec(model.credits)
    if (match === null) return model.credits
    const value = Number(match[1])
    return value === 0 ? t('indicator.model.free') : t('indicator.model.rateValue', { rate: String(value) })
  })()

  const account = status?.account
  // /v2/accounts 实测 type 为 ultimate（企业）/personal；enterprise 兼容旧形状。
  // 企业行与配置页同格式：企业版 · 大家保险集团有限责任公司。
  const accountText = [
    account?.accountType === 'enterprise' || account?.accountType === 'ultimate'
      ? t('account.enterprise')
      : account?.accountType === 'personal'
        ? t('account.personal')
        : undefined,
    account?.enterpriseName,
  ].filter((part): part is string => part !== undefined).join(' · ') || undefined

  // 右上角用户徽章：企业内姓名 · 账号昵称（如 裴昱 · DJ028191）；无企业姓名时只显示昵称。
  const userBadge = account?.enterpriseUserName !== undefined
    ? account.enterpriseUserName
      + (account.nickname !== undefined && account.nickname !== account.enterpriseUserName
        ? ' · ' + account.nickname
        : '')
    : account?.nickname

  const ratio = quota !== undefined && quota.limit > 0
    ? Math.min(1, Math.max(0, quota.used / quota.limit))
    : 0
  const percent = Math.round(ratio * 100)
  const percentLabel = percentText(ratio)
  const resetAt = formatReset(quota?.resetAt)
  const resetDays = resetAt === undefined ? null : daysUntil(resetAt)

  const setRoot = useCallback((el: HTMLElement | null) => { rootRef.current = el }, [])

  // 未配置 Key（或状态未加载完成）时不渲染图标：对话页只在有 CodeBuddy
  // 配置时才出现这个标；加载完成后配置态自动亮出。
  if (status?.keyConfigured !== true) return null

  // 会话头部 logo 胶囊：挂在官方 header.utilities 槽位（session log 按钮左边）。
  const trigger = (
    <div ref={setRoot} style={{ position: 'relative', display: 'inline-flex' }}>
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
    </div>
  )

  return (
    <>
      {trigger}
      {open && point !== null
        ? createPortal(
          <div
            className="ccb-indicator-panel"
            role="dialog"
            aria-label={t('indicator.title')}
            style={{
              ...panelStyle,
              ...(point.top === undefined ? {} : { top: point.top }),
              ...(point.right === undefined ? {} : { right: point.right }),
              ...(point.left === undefined ? {} : { left: point.left }),
              ...(point.bottom === undefined ? {} : { bottom: point.bottom }),
              width: point.width,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, lineHeight: '18px', marginBottom: '6px' }}>
              <span style={{ display: 'inline-flex', flex: '0 0 auto', fontSize: 16, lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: SQUARE_LOGO_SVG }} />
              {/* 标题不换行：放不下时省略号截断，把空间让给徽章。 */}
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t('indicator.title')}
              </span>
              {userBadge !== undefined
                ? (
                  <span style={{
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
                  }}>
                    {userBadge}
                  </span>
                )
                : null}
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
                  {quota === undefined && quotaError === undefined
                    ? <div style={captionStyle}>{t('indicator.loading')}</div>
                    : null}
                  {quota !== undefined
                    ? (
                      <>
                        {/* 容量条对齐 dsh-file-manage 配额条：加厚 16px、未使用区
                            45° 斜纹、文字居中叠加、business 蓝填充。 */}
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
            {model !== undefined
              ? (
                <>
                  <div style={dividerStyle} />
                  {/* 模型卡（参考官方模型展示）：加粗名 → 描述 → 可用功能 → 分隔 → 消耗速度。 */}
                  <div style={{ fontSize: '13px', lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>
                    {model.name.split('  ')[0]}
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
                  <div style={dividerStyle} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={captionStyle}>{t('indicator.model.rate')}</span>
                    <span style={{ fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }}>{rateText}</span>
                  </div>
                </>
              )
              : null}
            {/* 合集品牌行：面板 footer 居中，上方分割线与内容隔开；紧凑规格。 */}
            <div style={{ height: '1px', background: 'var(--dsw-alias-border-l1)', margin: '1px 0' }} />
            <div style={{ textAlign: 'center', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' }}>
              🐦 dsh-sparrow
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
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
