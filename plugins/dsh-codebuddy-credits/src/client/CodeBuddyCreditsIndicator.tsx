/**
 * CodeBuddy 额度入口：会话页挂官方 conversation.session.header.utilities
 * 槽位（kind=list，scope=session；session log 下载按钮同槽位，本插件
 * order -10 渲染在其左边）。blank 会话 hero 态官方 header 整体隐藏
 * （hideChrome），utilities 不渲染——改经 conversation.input.dock 槽位的
 * hero 锚点（CodeBuddyCreditsHeroAnchor）挂同一入口：读官方根元素
 * data-phase 公开标记，相位为 hero 时 portal 到会话根右上角（absolute 对齐
 * header 行几何：top 14 / right 28），active 相位返回 null 让位 header 常驻
 * 入口。点击展开面板：账号、本期额度（进度条 + 已用/剩余 + 重置日期）、
 * 当前选中 CodeBuddy 模型的信息。全部颜色走 --dsw-* 官方 token（进度条
 * 填充对齐官方发送按钮 hover 色 --dsw-alias-button-info-hover），深浅
 * 主题自动。
 *
 * 当前选中模型读官方共享模型目录（ctx.modelDirectories，与模型选择器
 * 同一 store，含目录默认值兜底），目录不可用时退回 session 投影
 * （useProjection('modelSelection')）——都是框架公开 seam，不读私有状态。
 *
 * 模型事实表独立在 ./model-facts.ts：额度卡、设置卡片与自建模型选择器共用
 * 同一份缓存（事实只来自 /api/codebuddy-credits/status 的 models 列表）。
 *
 * ## 顶栏窄化（owner 2026-10-02）
 *
 * owner：「对话区域宽度变窄后，咱们 codebuddy 插件的和其他元素重叠了，
 * 我看官方的智能体团队按钮有缩放变化策略」。
 *
 * **根因**（`TEMP/cb8.mjs` 实测）：官方 `.titleRow` 里 `.headerActions` 是
 * `flex: none` 且宽 429px，而 `.titleCluster` 被压窄后**它溢出** cluster 右缘
 * （容器 616/576/536/496/456/416 时溢出 0/33/53/73/93px），正好落到下一个兄弟
 * `.headerUtilities`（我们的按钮）上。⚠️ 把我们的按钮藏掉仍然溢出 ⇒ 是官方那一行
 * 宽度不够；但**我们的宽度占同一行的预算**（横排 lockup 84px vs 方标 34px，差 50px）。
 *
 * **处置**：同官方同款**容器查询**策略 —— 容器 ≤ `MARK_COLLAPSE_PX` 时去掉文字、
 * 只留「彩色方标」（owner 说的那个「彩色版无文字 logo」= lobehub/lobe-icons 的
 * `codebuddy-color.svg`，就是本文件已有的 `MARK_SQUARE_SVG`）。
 * 实测（`TEMP/cb9.mjs`）：容器 ≤616 那几档的重叠（最大 93px）全部消掉。
 * 更窄时残留的是**官方自己**的溢出（把我们的按钮设成 0 宽也照旧），不再继续让位。
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

/**
 * hero 变体的入口几何：官方 header 在 hero 相位仍渲染右上角「打开右侧栏」按钮
 * （`[data-conversation-header-corner]`），故入口不能再按固定 top/right 贴死
 * header 内边距（0.2.0-rc.1 实测：固定 right 28 会与那个 28px 角按钮重叠 12px）。
 * 改为量角按钮的矩形、贴它左边留 8px 间隙，角按钮取不到时才退回旧几何。
 */
const HERO_BADGE_FALLBACK_TOP_PX = 14
const HERO_BADGE_FALLBACK_RIGHT_PX = 28
const HERO_BADGE_GAP_PX = 8
/** 入口按钮高度（与 .ccb-indicator-button 的 28px 一致，用于与角按钮垂直居中）。 */
const INDICATOR_BUTTON_HEIGHT_PX = 28
const HEADER_CORNER_SELECTOR = '[data-conversation-header-corner]'

/**
 * hero 入口的 **portal 容器** —— 必须是**拥有 `@container` 上下文**的那个元素。
 *
 * ## ⚠️ 为什么不能直接 portal 到会话根（原实现，实测是坏的）
 *
 * 窄化靠 `@container (max-width: MARK_COLLAPSE_PX)`，而容器查询只对**有容器祖先**的
 * 元素生效。官方把 `container-type: inline-size` 挂在 **`.titleRow`** 上
 * （`ConversationRoot.module.css:71`），而 `.titleRow` 是会话根（`[data-phase]`）的
 * **后代**、不是祖先。
 *
 * 原实现 portal 到会话根 ⇒ 那个节点**没有容器祖先** ⇒ 查询恒不命中 ⇒
 * 两条默认值（宽标 `inline-flex` / 方标 `none`）一直生效：
 * 真机实测（hero 相位，`.titleRow` 宽 **376** ≤ 阈值 656 时）入口仍是 **84px** 横排
 * lockup，而 header 变体在同一宽度下正确收成 **28px** 方标 —— 同一个按钮、两种行为。
 * （不抛错、不影响 boot，纯观感；也**不重叠**官方元素，故此前没被发现。）
 *
 * ## 为什么挂"角按钮的父元素"
 *
 * 那个父元素**就是** `.titleRow`（容器自己）⇒ 查询恢复生效。同时它
 * `position: static`（`ConversationRoot.module.css:64-71` 未设 position）⇒
 * 绝对定位的包含块**仍是会话根** ⇒ `top` / `right` 那套相对会话根的内边距盒几何
 * **逐像素不变**。真机实测：容器 376 时右缘 before 428 / after 428（完全一致），
 * 只有宽度 84 → 28。
 *
 * ⚠️ 取角按钮要**限定在本会话根内**（`rootEl.querySelector`），不用
 * `document.querySelector`：多会话根（如子代理标签）并存时会取错那一棵树。
 * 角按钮是空的时 `display: none`，但元素仍在 DOM 里，`parentElement` 照常可用。
 *
 * 角按钮取不到（官方改结构）时退回会话根 —— 退化成**原行为**（宽标不窄化），
 * 属良性降级、不抛错。
 * @param rootEl - 已解析的会话根（`[data-phase]`）。
 * @returns 承载 `@container` 上下文的 portal 容器。
 */
function heroPortalTarget(rootEl: Element): Element {
  return rootEl.querySelector(HEADER_CORNER_SELECTOR)?.parentElement ?? rootEl
}

/**
 * 面板标题 + **顶栏窄化**共用的方形渐变图标（Combine 里取出的 Color 单块，独立渐变 id）。
 *
 * ⚠️ 顶栏那枚按钮在容器变窄时会换成**这个**（去掉文字、只留彩色方块）——
 * 它就是 owner 2026-10-02 说的「之前有一个彩色版但是没有文字的 logo」，
 * 上游是 lobehub/lobe-icons 的 `packages/static-svg/icons/codebuddy-color.svg`
 * （<https://github.com/lobehub/lobe-icons>，图标页 <https://lobehub.com/icons/codebuddy>）。
 */
export const MARK_SQUARE_SVG = '<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>CodeBuddy</title><defs><radialGradient cx="0" cy="0" gradientTransform="matrix(-9.00009 -16 16 -9.00009 21 24.5)" gradientUnits="userSpaceOnUse" id="ccb-logo-square-gradient" r="1"><stop stop-color="#2EA99D"></stop><stop offset="1" stop-color="#6C4DFF"></stop></radialGradient></defs><path d="M18.821 0H5.18A5.179 5.179 0 000 5.179V18.82A5.179 5.179 0 005.179 24H18.82A5.179 5.179 0 0024 18.821V5.18A5.179 5.179 0 0018.821 0z" fill="url(#ccb-logo-square-gradient)"></path><path d="M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z" fill="#fff"></path><path d="M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z" fill="#fff"></path></svg>'

/** chat-fim 同款橙色（dsh 告警琥珀 token + #d9822b 兜底）。 */
const CREDIT_ORANGE = 'var(--dsw-alias-state-warn-primary, #d9822b)'

/**
 * 标记字号（px）—— 两种形态共用的**唯一来源**（样式表里的显示宽度也由它派生）。
 *
 * 横排 lockup 是 `0 0 90 24`（3.75:1），同字号下自然比 `0 0 24 24` 的方标宽约 3.75 倍，
 * 这正是收窄的依据。
 */
export const MARK_FONT_PX = 18

/**
 * 顶栏**窄化阈值**（容器宽 px）：容器 ≤ 它时只剩方标（去掉文字）。
 *
 * 位置与机制都对齐官方 `ui-agent-team` 的 `TeamAction.module.css:27-31`
 * （`@container (max-width: 480px) { .triggerLabel { display: none } }`）——
 * 容器是官方 `.titleRow` 的**匿名** `container-type: inline-size`。
 *
 * ⚠️ 数值是**实测定**的（`TEMP/cb10.mjs` 逐档量「第一个不重叠的按钮宽度」）：
 * 容器 ≥656 时 84px 的横排 lockup 也不重叠；容器 ≤616 起被官方 `.headerActions`
 * 的溢出压到 ⇒ 取 656，留一档余量。改它必须重跑那类量测。
 */
export const MARK_COLLAPSE_PX = 656

/** CodeBuddy Combine（color）组合 logo：lobehub/lobe-icons 的 Color（紫蓝渐变圆角方块）+ Text（字样）横排 lockup，来源 https://lobehub.com/icons/codebuddy。图标渐变保持品牌色，字样 fill=currentColor 随 DSH 主题着色。 */
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
  /** Max 模式（推理档位锁）状态（2026-09-07 起随状态接口下发）。 */
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
  /** 会话头部 utilities 槽位（session 作用域，框架注入 SessionStandardProps）。 */
  sessionId?: string
  /** 框架注入的会话投影 hook（目录缺失时兜底当前选中模型）。 */
  useProjection?: <K extends string>(key: K) => ModelSelectionProjection | undefined
  /** 插件注入：当前会话的共享模型目录 store（官方 ctx.modelDirectories）。 */
  directoryFor: (sessionId: string) => DirectoryStore | undefined
  /** header 常驻入口（默认）或 blank 会话 hero 锚点（portal 到会话根右上角）。 */
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
  // 0.1.7 起 --dsw-specific-menu 是半透明玻璃色，官方要求同规则内配对 backdrop-filter
  // （docs/web-styling.zh.md:25），否则背后文字会透出来（owner 真机报「全透明了」）。
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

/** 面板最大宽度：会话区足够宽时的上限。 */
const PANEL_MAX_WIDTH = 300
/** 面板与会话区左缘的最小间距。 */
const PANEL_EDGE_GAP = 8

/** 模块级状态缓存：槽位重挂载（切会话/视图）时以它初始化，避免「空 → 出现」闪烁。 */
let cachedStatus: StatusPayload | undefined

/**
 * blank 会话 hero 锚点的落点解析：从 dock 内隐藏锚 span 向上找官方会话根
 * 元素（[data-phase] 公开 DOM 标记，ConversationRoot 每相位重渲染时改写
 * hero/settling/active），相位为 hero 时入口可见——官方 header 只在 hero 态
 * 整体隐藏（hideChrome），active 相位 header 常驻入口已就位，hero 锚点
 * 必须让位（settling 也不显示：延续会话可能 header 已可见，避免双份）。
 */
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
  // hero 变体的会话根解析（header 变体不使用结果，但 hook 无条件调用；
  // 锚 span 只在 hero 变体渲染，header 变体零观察零开销）。
  const hero = useHeroRoot()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<StatusPayload | undefined>(() => cachedStatus)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  // 配额独立于状态接口：/status 保持毫秒级（图标出现不等待配额网络请求），
  // 展开面板时才拉 /quota。
  const [quota, setQuota] = useState<QuotaView | undefined>(undefined)
  const [quotaError, setQuotaError] = useState<string | undefined>(undefined)
  // 面板定位（打开时计算，滚动/缩放跟随重定位）：
  // header 与 hero 变体同公式：右缘对齐按钮、左缘钳制在会话区。
  const [point, setPoint] = useState<{
    top: number
    right: number
    width: number
  } | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  // hero 变体的入口落点（相对 portal 容器 hero.rootEl 的 padding box）。
  // null = 还没量到，用兜底几何渲染，量到后替换。
  const [heroAnchor, setHeroAnchor] = useState<{ top: number; right: number } | null>(null)
  // 两个加载器各自独立的请求序号：共享一个序号会让并发请求互相作废——展开
  // 面板时 status/quota 同时发出，先发者的响应会被后发者的序号增长丢弃，
  // 面板一直停在「读取中」（实测）。各自维护序号，只作废自己这条流里被
  // 更新的旧响应。
  const statusSeq = useRef(0)
  const quotaSeq = useRef(0)

  /**
   * 品牌标 SVG 的**实例作用域**：本组件在同一文档里会注入多份内联品牌标（顶栏按钮
   * 的宽/窄两形态 + 展开面板标题行），而两枚常量各自带**写死的渐变 id**。
   * `fill="url(#id)"` 按文档序**第一个**同名元素解析：对话区宽（> 656px）时窄档那份是
   * `display:none`，于是面板那份解析到不可见定义 ⇒ 渐变方底不画、只剩硬编码白色字形
   * ⇒ **浅色模式下看起来就是「logo 没反色」**（owner 2026-10-07 报）。
   *
   * 修法（与官方 `ui-primitives` 的 `CodeFileIcon` / `plugin-artwork` 同款）：**每个注入点**
   * 各自给 id 加实例前缀 ⇒ 每份只引用**自己**那份定义，而那一定义必然在它自己的
   * （可见）子树里。
   *
   * ⚠️ 前缀必须**逐注入点**不同（`wide` / `narrow` / `panel`），不能一个组件只给
   * 一个前缀就重复用在多处：面板标题行与顶栏窄档用的是**同一枚** `MARK_SQUARE_SVG`，
   * 共用前缀就又把两个同名 id 摆回同一文档，宽档下症状原样复发（本轮自测抓到的）。
   *
   * id 只影响 SVG 内部引用，不参与任何选择器（样式表用 class，见 `ensureIndicatorStyles`）。
   */
  const markScope = useId()
  const markWideSvg = useMemo(() => scopeMarkSvg(LOGO_SVG, `ccb-logo-${markScope}-wide`), [markScope])
  const markNarrowSvg = useMemo(() => scopeMarkSvg(MARK_SQUARE_SVG, `ccb-logo-${markScope}-narrow`), [markScope])
  const markPanelSvg = useMemo(() => scopeMarkSvg(MARK_SQUARE_SVG, `ccb-logo-${markScope}-panel`), [markScope])

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

  /** hero 入口落点：贴官方右上角按钮左侧（留 HERO_BADGE_GAP_PX 间隙）、与它垂直居中；
   *  取不到角按钮时退回旧几何。滚动不改变两者相对位置，故只需在挂载、相位切换与
   *  窗口/容器尺寸变化时重算。 */
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

  /**
   * 打开面板时**先量再画**：必须用 `useLayoutEffect`，不能用 `useEffect`。
   *
   * ⚠️ owner 2026-10-02 报「codebuddy 图标缩放后，点击弹窗会先在原来位置出现一下」。
   * 根因就在这个时机上：
   *
   * 1. `point` 是 useState，**关闭时不清空** ⇒ 重开时第一次渲染直接拿**上一次的坐标**；
   * 2. `position()` 原来写在 `useEffect`（**被动效果**）里 —— 它在浏览器**绘制之后**才跑
   *    ⇒ 那一帧已经用旧坐标画出来了，随后 `setPoint` 再把它挪到正确位置。
   *
   * 图标一旦缩放（容器查询切换），按钮会横移几十像素，旧坐标与正确坐标差得很远，
   * 于是那一下「跳」肉眼可见。
   *
   * `useLayoutEffect` 在 DOM 变更后、**浏览器绘制前**同步执行，其中的 `setPoint`
   * 会在同一帧内同步重渲染 ⇒ 面板**从第一帧起就在正确位置**，不需要清空 `point`
   * 也不需要额外渲染次数。
   *
   * 实测（`TEMP/cb18.mjs` 量 style.right 逐帧）：修前窄档→宽档重开时会出现旧坐标帧
   * （827 → 135），修后首帧即 135。
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

  // hero 变体：相位离开 hero（发首条消息 → engaging/active，header 常驻
  // 入口接管）时收起已展开面板——否则面板停在旧锚点坐标上与新入口并存。
  useEffect(() => {
    if (variant === 'hero' && !hero.visible && open) setOpen(false)
  }, [variant, hero.visible, open])

  const selected = selection?.provider === PROVIDER_ID ? selection : undefined
  const model = selected === undefined
    ? undefined
    : status?.models.find(entry => entry.id === selected.model)

  // 模型只读事实（系数 · 上下文长度，如 `x0.00 · 1M`）：与设置清单、模型选择器
  // 同一口径（formatModelFacts）；无事实时 undefined（只显示模型名）。
  const modelFactsText = formatModelFacts(model)

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

  // 右上角用户徽章：企业内姓名 · 账号昵称（如 张三 · zhangsan）；无企业姓名时只显示昵称。
  const userBadge = account?.enterpriseUserName !== undefined
    ? account.enterpriseUserName
      + (account.nickname !== undefined && account.nickname !== account.enterpriseUserName
        ? ' · ' + account.nickname
        : '')
    : account?.nickname

  // Max 模式（推理档位锁）开关：共享 store 同源（选择器锁定态即时联动）；
  // 写入乐观更新，失败回滚并短暂提示。
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

  // 未配置 Key（或状态未加载完成）时不渲染图标：对话页只在有 CodeBuddy
  // 配置时才出现这个标；加载完成后配置态自动亮出。
  if (status?.keyConfigured !== true) return null

  // 会话头部 logo 胶囊：header 变体挂在官方 header.utilities 槽位（session
  // log 按钮左边）；hero 变体 portal 到会话根右上角，absolute 几何对齐
  // header 行（padding-top 12 + 32px 行内 28px 按钮居中 = top 14，
  // right 28 同 header padding-right）。
  const triggerButton = (
    <button
      type="button"
      aria-label={t('indicator.open')}
      aria-expanded={open}
      title={t('indicator.open')}
      onClick={() => setOpen(value => !value)}
      className="ccb-indicator-button"
    >
      {/* 两种形态**都渲染**，显隐全交给样式表里的 @container（容器 = 官方 .titleRow）。
          ⚠️ 这里**不能**写 display 内联样式：内联优先级高于样式表，写了
          @container 里的 display:none 就永远不生效（本轮实测踩过，见文件顶部注释）。 */}
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

  // hero 变体：相位不是 hero（active 时 header 常驻入口已就位）或会话根
  // 尚未解析（锚 span 刚挂载、回调 ref 未回填）时不渲染入口。
  const heroHidden = variant === 'hero' && (!hero.visible || hero.rootEl === null)

  return (
    <>
      {/* hero 锚 span：display:none 占位，closest 解析会话根仍有效；不渲染
          时回调 ref 收不到元素，故必须在入口可见性判定之外常驻。 */}
      {variant === 'hero'
        ? <span ref={hero.anchorRef} style={{ display: 'none' }} aria-hidden="true" />
        : null}
      {heroHidden
        ? null
        : variant === 'hero' && hero.rootEl !== null
          /* ⚠️ portal 容器必须是**拥有 @container 上下文**的那一个（见 heroPortalTarget
             的文档块）：挂会话根本身会让窄化查询恒不命中，hero 入口永远收不成方标。 */
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
                  // 用户徽章：点击在新标签打开 CodeBuddy 个人主页（固定常量 URL，
                  // 经 safeExternalHref 白名单校验）。锚点样式沿用徽章本身，
                  // 只去掉下划线、加 hover 反馈，保持原有视觉。
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
                        {/* 容量条对齐 dsh-file-manage 配额条：加厚 16px、未使用区
                            45° 斜纹、文字居中叠加、填充对齐官方发送按钮
                            hover 色（--dsw-alias-button-info-hover）。 */}
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
            {/* Max 模式（推理档位锁）：模型卡上方、分割线下独立一行——
                标签 + 档位开关；锁开后所有推理模型请求强制 max 档。 */}
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
                  {/* 模型卡（参考官方模型展示）：加粗名 + 右侧只读事实（系数 · 上下文
                      长度）→ 描述 → 可用功能。名字与事实两列，事实缺失时只显示名字。 */}
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
            {/* 合集品牌行：分割线与文字合并一行；-6px 底距抵消面板 12px 内边距，
                使「分割线上方 gap 6px」与「文字下方 6px」对称（上下边距一致）。 */}
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
  /** 框架 SessionStandardProps：槽位所属会话 id（header 槽位同款注入）。 */
  sessionId?: string
  /** conversation.input.dock 的 InputZone owner 份额（兜底会话 id 来源）。 */
  session?: { sessionId?: unknown }
  /** 框架注入的会话投影 hook（透传给额度入口）。 */
  useProjection?: <K extends string>(key: K) => ModelSelectionProjection | undefined
  /** 插件注入：当前会话的共享模型目录 store（官方 ctx.modelDirectories）。 */
  directoryFor: (sessionId: string) => DirectoryStore | undefined
}

/**
 * blank 会话 hero 锚点：官方 header 在 hero 态整体隐藏（hideChrome，
 * header.utilities 不渲染），额度入口改经 conversation.input.dock 槽位挂载
 * （公开 seam，hero/active 两态都渲染；输入区草稿槽位，本组件零可见输出）。
 * 入口组件读官方根元素 data-phase 公开标记，hero 相位 portal 到会话根
 * 右上角（与 header 行同位），active 相位返回 null 让位 header 常驻入口。
 */
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
 * 图标按钮的 hover/focus 样式 + **顶栏窄化**（inline style 表达不了 `:hover`
 * 与容器查询，注入一次）。
 *
 * ## 窄化那两条为什么用**容器查询**而不是 JS
 *
 * 官方 `ui-agent-team` 的智能体团队按钮就是这么做的
 * （`TeamAction.module.css:27-31`：`@container (max-width:480px) { .triggerLabel { display:none } }`），
 * 容器是官方 `.titleRow` 上的**匿名** `container-type: inline-size`
 * （`ConversationRoot.module.css:64-71`）。实测这条链上的容器查询在本页确实生效
 * （`TEMP/cb7.mjs`）。同款做法的好处：**零 JS、零 ResizeObserver、零布局抖动**，
 * 且阈值随官方容器定义自动跟随。
 *
 * ## ⚠️ 为什么这里要写 `display`（而 JSX 里不能写）
 *
 * 显隐必须由**样式表**控制：若在 JSX 的行内 `style` 里写 `display: 'inline-flex'`，
 * 那是内联声明、优先级高于样式表 ⇒ `@container` 里的 `display: none` 永不生效。
 * 所以两个形态的 `display` **只**在这里给（`inline-flex` / `none`），JSX 只给字号与行高。
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
    // 两种形态的**默认**显隐：宽屏给横排 lockup（带字样），方标收起。
    // 两者都不写内联 display，故这两条能生效。
    '.ccb-mark-wide { display: inline-flex; }',
    '.ccb-mark-narrow { display: none; }',
    // 容器 ≤ 阈值：横排放不下 ⇒ 只剩彩色方标（去掉文字），内边距同收一档
    // （方标是方形，8px 内边距占比偏大 ⇒ 收到 5px，让整体占位接近官方那些纯图标按钮）。
    // 阈值 = MARK_COLLAPSE_PX，实测定值；与官方 team 按钮同一种机制、同一容器。
    // 实测：宽档 84px（不变）、窄档 28px —— 一行省下 56px。
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
    // 进度条填充：官方发送按钮 hover 色（--dsw-alias-button-info-hover——
    // 浅色 deepseek-400 #679EFE / 深色 deepseek-500 #4176E6，官方 alias
    // 随主题自动切换，无需自写深色标记覆盖）。
    '.ccb-quota-fill { background: var(--dsw-alias-button-info-hover); }',
    // Max 模式档位开关：轨道 28×16 + 12px 圆钮；开启色同进度条填充。
    '.ccb-max-switch { position: relative; flex: 0 0 auto; width: 28px; height: 16px; padding: 0; border: none; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover); cursor: pointer; transition: background 120ms ease; }',
    '.ccb-max-switch:disabled { cursor: default; opacity: 0.6; }',
    '.ccb-max-switch:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }',
    '.ccb-max-switch-on { background: var(--dsw-alias-button-info-hover); }',
    '.ccb-max-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--dsw-alias-label-primary, #fff); transition: transform 120ms ease; }',
    '.ccb-max-switch-on .ccb-max-knob { transform: translateX(12px); }',
  ].join('\n')
  document.head.append(style)
}
