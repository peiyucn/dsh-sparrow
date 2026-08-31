/** FIM 续写：共享状态 + 开关（input.left）+ 数据面 dock（input.dock）+ @ 列表样式候选菜单（input.overlay）。 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useAnchoredMaxHeight, IconSparkle16, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { TRIGGER_SENSITIVITIES, formatTokenCount, shouldTriggerSuggest, type TriggerSensitivity } from '../suggest.js'

export interface SuggestCompleteResult {
  readonly suggestions: readonly string[]
  readonly model: string
  readonly temperature: number
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number }
}

export interface ChatSuggestDockInjected {
  /** 注入面所属会话（槽工厂按 sessionId 生成）；菜单据此校验建议归属，堵跨会话误采用。 */
  readonly sessionId: SessionId
  /** 查询当前会话主模型是否支持（deepseek 系列）；false 时整体隐藏。 */
  isSupported: (sessionId: SessionId) => Promise<boolean>
  /** 发起一次 host 路由请求；由调用方负责陈旧响应判定。续写模型固定 deepseek-v4-flash。 */
  requestComplete: (
    sessionId: SessionId,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<SuggestCompleteResult>
  /** 通过 scoped bail 事件把建议追加进草稿；返回是否被输入机接受。 */
  adopt: (sessionId: SessionId, text: string, span: TokenSpan) => boolean
}

export type ChatSuggestDockProps = PropsRuntime<'conversation.input.dock'> & ChatSuggestDockInjected & { t: TranslateNS<'chat-suggest'> }
export type ChatSuggestSwitchProps = PropsRuntime<'conversation.input.left'> & ChatSuggestDockInjected & { t: TranslateNS<'chat-suggest'> }
export type ChatSuggestMenuProps = PropsRuntime<'conversation.input.overlay'> & ChatSuggestDockInjected & { t: TranslateNS<'chat-suggest'> }

const ENABLED_STORAGE_KEY = 'dsh-chat-suggest:enabled'
const SENSITIVITY_STORAGE_KEY = 'dsh-chat-suggest:sensitivity'
/** 菜单高度设计上限（同官方 MenuDropdown）。 */
const MENU_MAX_HEIGHT = 320
/** 旋转光环的卡片矩形自愈测量周期。 */
const RING_MEASURE_INTERVAL_MS = 300

/** 读取本地开关状态：默认关闭，仅显式存过 '1' 才开启；非法值回退关闭。 */
export function readEnabled(storage: { getItem(key: string): string | null }, key = ENABLED_STORAGE_KEY): boolean {
  const value = storage.getItem(key)
  return value === '1'
}

// 模块级共享开关：开关（input.left）与建议条（input.dock）是两个 React 树，
// 用同一 bundle 内的可变状态 + 订阅器同步，避免靠 localStorage 事件（同页不触发）。
// 启动时读取本地持久化值；默认关闭（见 readEnabled）。
let sharedEnabled = false
try {
  sharedEnabled = readEnabled(window.localStorage)
} catch {
  sharedEnabled = false
}
const enabledListeners = new Set<() => void>()

/** 订阅共享开关状态；返回当前值。 */
export function useSuggestEnabled(): boolean {
  const [value, setValue] = useState(sharedEnabled)
  useEffect(() => {
    const listener = (): void => { setValue(sharedEnabled) }
    enabledListeners.add(listener)
    return () => { enabledListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享开关并持久化；返回新值。 */
export function setSuggestEnabled(next: boolean): void {
  if (sharedEnabled === next) return
  sharedEnabled = next
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? '1' : '0')
  } catch {
    // 隐私模式/配额满：内存态已生效，持久化静默失败（与读路径同防护）。
  }
  for (const listener of enabledListeners) listener()
}

// 模块级共享「联想中」状态：指示渲染在工具行开关旁，避免在输入框下方增减内容导致布局跳动。
let sharedBusy = false
const busyListeners = new Set<() => void>()

/** 订阅共享联想中状态；返回当前值。 */
export function useSuggestBusy(): boolean {
  const [value, setValue] = useState(sharedBusy)
  useEffect(() => {
    const listener = (): void => { setValue(sharedBusy) }
    busyListeners.add(listener)
    return () => { busyListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享联想中状态。 */
export function setSuggestBusy(next: boolean): void {
  if (sharedBusy === next) return
  sharedBusy = next
  for (const listener of busyListeners) listener()
}

// 模块级共享错误状态：禁用/凭据/上游错误让用户可见，而不是静默无建议。
let sharedError: string | null = null
const errorListeners = new Set<() => void>()

/** 订阅共享错误状态；返回当前值。 */
export function useSuggestError(): string | null {
  const [value, setValue] = useState(sharedError)
  useEffect(() => {
    const listener = (): void => { setValue(sharedError) }
    errorListeners.add(listener)
    return () => { errorListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享错误状态。 */
export function setSuggestError(next: string | null): void {
  if (sharedError === next) return
  sharedError = next
  for (const listener of errorListeners) listener()
}

// 模块级共享「模型支持」状态：主模型非 deepseek 系列时整体隐藏（像没装插件）。
let sharedSupported = true
const supportedListeners = new Set<() => void>()

/** 订阅共享模型支持状态；返回当前值。 */
export function useSuggestSupported(): boolean {
  const [value, setValue] = useState(sharedSupported)
  useEffect(() => {
    const listener = (): void => { setValue(sharedSupported) }
    supportedListeners.add(listener)
    return () => { supportedListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享模型支持状态。 */
export function setSuggestSupported(next: boolean): void {
  if (sharedSupported === next) return
  sharedSupported = next
  for (const listener of supportedListeners) listener()
}

/** 一条「建议 + 生成它的草稿快照」：菜单视图据此渲染与采用（span CAS）。 */
export interface SuggestionRecord {
  readonly text: string
  readonly sessionId: SessionId
  readonly draft: string
  readonly draftRev: number
  /** host 解析出的实际补全模型 id。 */
  readonly model: string
  /** 本次续写总 token（prompt + completion，跨并行请求求和）。 */
  readonly totalTokens: number
  /** 本次续写实际采样温度。 */
  readonly temperature: number
}

// 模块级共享建议：dock（数据面）写入，overlay 菜单（视图）读取；随草稿/相位变化清空。
let sharedSuggestion: SuggestionRecord | null = null
const suggestionListeners = new Set<() => void>()

/** 订阅共享建议；返回当前记录。 */
export function useSuggestion(): SuggestionRecord | null {
  const [value, setValue] = useState(sharedSuggestion)
  useEffect(() => {
    const listener = (): void => { setValue(sharedSuggestion) }
    suggestionListeners.add(listener)
    return () => { suggestionListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享建议（null = 清空）。 */
export function setSuggestion(next: SuggestionRecord | null): void {
  if (sharedSuggestion === next) return
  sharedSuggestion = next
  for (const listener of suggestionListeners) listener()
}

// 模块级「最近一次采纳」标记：菜单 Tab/点选采纳前记录预期采纳（新草稿 = 旧草稿 + 建议文本），
// dock 在草稿按此变化时跳过触发并消费标记——否则采纳后新草稿会立刻再次触发联想，
// 建议马上复现（且上游常以「助手：」口吻续写）。采纳失败（bail CAS 拒绝）回滚清除。
let lastAdoption: { sessionId: SessionId; draft: string; text: string } | null = null

/** 菜单采纳前记录预期采纳。 */
export function markSuggestAdoption(adoption: { sessionId: SessionId; draft: string; text: string }): void {
  lastAdoption = adoption
}

/** 清除采纳标记（采纳失败回滚 / dock 消费后）。 */
export function clearSuggestAdoption(): void {
  lastAdoption = null
}

/** 只读当前采纳标记。 */
export function peekSuggestAdoption(): { sessionId: SessionId; draft: string; text: string } | null {
  return lastAdoption
}

/** 读取本地触发灵敏度：eager/standard/conservative，非法值回退 standard。 */
export function readTriggerSensitivity(storage: { getItem(key: string): string | null }, key = SENSITIVITY_STORAGE_KEY): TriggerSensitivity {
  const value = storage.getItem(key)
  return value === 'eager' || value === 'standard' || value === 'conservative' ? value : 'standard'
}

// 模块级共享触发灵敏度（开关胶囊 ▾ 选择器写入，dock 触发与请求时读取）。
let sharedSensitivity: TriggerSensitivity = 'standard'
try {
  sharedSensitivity = readTriggerSensitivity(window.localStorage)
} catch {
  sharedSensitivity = 'standard'
}
const sensitivityListeners = new Set<() => void>()

/** 订阅共享触发灵敏度。 */
export function useTriggerSensitivity(): TriggerSensitivity {
  const [value, setValue] = useState(sharedSensitivity)
  useEffect(() => {
    const listener = (): void => { setValue(sharedSensitivity) }
    sensitivityListeners.add(listener)
    return () => { sensitivityListeners.delete(listener) }
  }, [])
  return value
}

/** 设置共享触发灵敏度并持久化。 */
export function setTriggerSensitivity(next: TriggerSensitivity): void {
  if (sharedSensitivity === next) return
  sharedSensitivity = next
  try {
    window.localStorage.setItem(SENSITIVITY_STORAGE_KEY, next)
  } catch {
    // 隐私模式/配额满：内存态已生效，持久化静默失败（与读路径同防护）。
  }
  for (const listener of sensitivityListeners) listener()
}

/** composer 卡片视口矩形（旋转光环定位；只读测量）。 */
function composerCardRect(): { x: number; y: number; width: number; height: number } | undefined {
  const card = document.querySelector<HTMLElement>('[data-composer-card]')
  if (card === null) return undefined
  const rect = card.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** 注入开关样式、联想中脉冲 keyframes 与候选菜单样式（按 data 属性去重）；返回 style 元素供卸载清理。 */
export function ensureSuggestBusyStyles(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-chat-suggest-busy]')
  if (existing !== null) return existing
  const style = document.createElement('style')
  style.dataset.dshChatSuggestBusy = ''
  style.textContent = `
/* 开关胶囊：官方下拉按钮同款（PermissionSelect trigger）——无边框、透明底、悬停亮底、省空间。 */
.dsh-chat-suggest-switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 28px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: 24px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-chat-suggest-switch:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-chat-suggest-switch-icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--dsw-alias-label-caption);
}
.dsh-chat-suggest-switch-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-chat-suggest-switch-on {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsh-chat-suggest-switch-on .dsh-chat-suggest-switch-icon {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
/* 关闭态：灰字区分（开启态紫色），不再用删除线。 */
.dsh-chat-suggest-switch-off .dsh-chat-suggest-switch-label {
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
}
/* 胶囊内灵敏度触发区（分割线右侧：三点 + ▾）：整区可点，只开合灵敏度菜单、不切换开关。
   不单独做悬停底色——按钮主体已有悬停底色，叠加会成嵌套椭圆。
   命中区铺满：负 margin 顶掉按钮右侧 padding 与分割线左侧 gap，视觉间距由 padding 补回
   （左 4px 与分割线左侧 gap 一致，右侧 9px 保持按钮右缘观感）。 */
.dsh-chat-suggest-switch-picker {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  gap: 3px;
  margin: 0 -4px 0 -4px;
  padding: 0 9px 0 4px;
  cursor: pointer;
}
.dsh-chat-suggest-switch-on .dsh-chat-suggest-switch-picker {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
/* 开关主体与灵敏度触发区之间的 1px 分割线（split-button 形态）。 */
.dsh-chat-suggest-switch-divider {
  flex: none;
  align-self: center;
  width: 1px;
  height: 12px;
  background: var(--dsw-alias-border-l2);
}
/* ▾：打开时旋转 180°。 */
.dsh-chat-suggest-switch-arrow {
  display: inline-flex;
  align-items: center;
  flex: none;
  color: var(--dsw-alias-label-caption);
  transition: transform 120ms ease;
}
.dsh-chat-suggest-switch-on .dsh-chat-suggest-switch-arrow {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsh-chat-suggest-switch-arrow-open {
  transform: rotate(180deg);
}
/* 窄行折叠为纯图标：官方 PermissionSelect 同款匿名 @container 规则，
   容器是 InputBar .row（container-type: inline-size），阈值同官方 460px。 */
@container (max-width: 460px) {
  .dsh-chat-suggest-switch .dsh-chat-suggest-switch-label {
    display: none;
  }
  .dsh-chat-suggest-switch-divider {
    display: none;
  }
  .dsh-chat-suggest-switch {
    padding: 0 6px;
  }
  .dsh-chat-suggest-switch-picker {
    margin: 0 -6px 0 -4px;
    padding: 0 11px 0 9px;
  }
}
@property --dsh-chat-suggest-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
.dsh-chat-suggest-ring {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  padding: 2px;
  border-radius: 24px;
  background: conic-gradient(
    from var(--dsh-chat-suggest-angle),
    transparent 0deg,
    transparent 300deg,
    color-mix(in srgb, var(--dsw-alias-button-info-fill, #4d6bfe) 85%, transparent) 340deg,
    color-mix(in srgb, var(--dsw-alias-button-info-fill, #4d6bfe) 30%, transparent) 355deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: dsh-chat-suggest-ring-spin 1.6s linear infinite;
}
@keyframes dsh-chat-suggest-ring-spin {
  to { --dsh-chat-suggest-angle: 360deg; }
}
/* 候选菜单锚点：镜像官方 overlayAnchor（绝对定位、零高、钉在 composer 卡片上沿）。 */
.dsh-chat-suggest-menu-anchor {
  position: absolute;
  inset: 0 0 auto;
  height: 0;
}
/* 菜单卡：官方 MenuDropdown 视觉 token（见 ui-input-trigger/MenuView.module.css）；
   紫色边框与开关 on 态同款，与官方 @ 列表做视觉区分。 */
.dsh-chat-suggest-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 320px;
  overflow: hidden;
  padding: 4px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-button-info-fill, #4d6bfe);
  border-radius: 12px;
  background: var(--dsw-specific-menu);
  box-shadow: var(--dsw-shadow-lv3);
}
.dsh-chat-suggest-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  text-align: left;
}
.dsh-chat-suggest-menu-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
/* 建议长句 2 行截断（超出省略），全文经 title 提示。 */
.dsh-chat-suggest-menu-text {
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
}
/* 行尾键位提示：官方 @ 列表 drillHint 同款（caption 色文字 + 键盘帽，右对齐）。 */
.dsh-chat-suggest-menu-trailing {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  /* 与建议文字保持呼吸间距（文字 flex:1 顶满后 auto 边距为 0，靠这里拉开）。 */
  padding-left: 24px;
}
.dsh-chat-suggest-menu-hint {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
/* 键盘帽与官方 @ 列表 drillHint 完全同款（token 逐项一致：底色/圆角/内边距/字色）。 */
.dsh-chat-suggest-menu-kbd {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-caption);
  font-family: inherit;
  font-size: 11px;
  line-height: 18px;
}
/* 菜单底部：右下角展示 token 数与实际模型。 */
.dsh-chat-suggest-menu-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
  padding: 2px 4px 0;
  border-top: 1px solid var(--dsw-alias-border-inverted);
}
/* 触发灵敏度弹层：官方 MenuDropdown 同款 token，锚定胶囊右下，空间不足自动向上。 */
.dsh-chat-suggest-sensitivity-popover {
  position: fixed;
  z-index: 2100;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 240px;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-inverted);
  border-radius: 12px;
  background: var(--dsw-specific-menu);
  box-shadow: var(--dsw-shadow-lv3);
}
.dsh-chat-suggest-menu-usage {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
.dsh-chat-suggest-sensitivity-option {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 32px;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dsh-chat-suggest-sensitivity-option:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-chat-suggest-sensitivity-option-on {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsh-chat-suggest-sensitivity-option-check {
  width: 14px;
  flex: none;
  font-size: 12px;
}
.dsh-chat-suggest-sensitivity-option-rule {
  margin-left: auto;
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
/* 灵敏度竖点：恒显 3 个方点，自下而上点亮 3/2/1 个 = 高/中/低；未点亮为更浅的淡色占位。
   与 ▾ 同在灵敏度触发区内（分割线左侧是开关主体）；点 3px、方角（owner 拍板：档位用方点）。 */
.dsh-chat-suggest-dots {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.dsh-chat-suggest-dot {
  width: 3px;
  height: 3px;
  border-radius: 0;
  background: color-mix(in srgb, currentColor 30%, transparent);
}
.dsh-chat-suggest-dot-on {
  background: currentColor;
}
`
  document.head.appendChild(style)
  return style
}

/** 输入框工具行左侧的开关胶囊（挂在 conversation.input.left）：点击切换开关，右侧 ▾ 弹出触发灵敏度三档。 */
export function ChatSuggestSwitch(props: ChatSuggestSwitchProps) {
  const { t } = props
  const enabled = useSuggestEnabled()
  const busy = useSuggestBusy()
  const error = useSuggestError()
  const supported = useSuggestSupported()
  const sensitivity = useTriggerSensitivity()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPoint, setPickerPoint] = useState<{ x: number; y: number; up: boolean } | null>(null)
  const switchRef = useRef<HTMLButtonElement | null>(null)

  /** 高/中/低 → 自下而上点亮 3/2/1 个点（恒显 3 个占位点，档位只靠颜色区分）。 */
  const DOT_LIT_COUNT: Record<TriggerSensitivity, number> = { eager: 3, standard: 2, conservative: 1 }
  /** 档位显示名（locale）。 */
  const label = t(`sensitivity.${sensitivity}`)

  /** 依据开关胶囊矩形计算弹层锚点；空间不够时向上弹出（官方下拉惯例）。 */
  const computePickerPoint = (): { x: number; y: number; up: boolean } | null => {
    const rect = switchRef.current?.getBoundingClientRect()
    if (rect === undefined) return null
    const estimate = 128 + 8
    const up = rect.bottom + estimate > window.innerHeight
    return { x: rect.right, y: up ? rect.top - 4 : rect.bottom + 4, up }
  }

  const openPicker = (): void => {
    setPickerPoint(computePickerPoint())
    setPickerOpen(true)
  }

  // 弹层打开时：点外部关闭、Esc 关闭；滚动/缩放**跟随重定位**（官方下拉行为，
  // 不关闭——生成中的会话流式输出会带动聊天区滚动，关掉弹层就是这里的 bug）。
  useEffect(() => {
    if (!pickerOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest('.dsh-chat-suggest-sensitivity-popover') !== null) return
      if (switchRef.current !== null && switchRef.current.contains(event.target)) return
      setPickerOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPickerOpen(false)
    }
    const reposition = (): void => {
      const next = computePickerPoint()
      if (next === null) setPickerOpen(false)
      else setPickerPoint(next)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [pickerOpen])

  if (!supported) return null
  return (
    <>
      <button
        ref={switchRef}
        type="button"
        className={enabled ? 'dsh-chat-suggest-switch dsh-chat-suggest-switch-on' : 'dsh-chat-suggest-switch dsh-chat-suggest-switch-off'}
        title={busy ? t('dock.busy') : error ?? (enabled ? t('sensitivity.hint', { label }) : t('switch.offHint'))}
        aria-pressed={enabled}
        aria-busy={busy}
        onClick={() => {
          // 标签点击恒切换开关；弹层开着时一并收起（官方 PermissionSelect 触发器再点即合）。
          if (pickerOpen) setPickerOpen(false)
          setSuggestEnabled(!enabled)
        }}
      >
        <span className="dsh-chat-suggest-switch-icon" aria-hidden><IconSparkle16 size={14} /></span>
        <span className="dsh-chat-suggest-switch-label">{t('switch.label')}</span>
        <span className="dsh-chat-suggest-switch-divider" aria-hidden />
        <span
          className="dsh-chat-suggest-switch-picker"
          role="button"
          tabIndex={0}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          aria-label={t('sensitivity.aria', { label })}
          title={t('sensitivity.aria', { label })}
          onClick={(event) => {
            // 灵敏度触发区（三点 + ▾）：只开合灵敏度菜单，不切换开关；再点收起（官方 PermissionSelect 同款 toggle）。
            event.stopPropagation()
            if (pickerOpen) setPickerOpen(false)
            else openPicker()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              if (pickerOpen) setPickerOpen(false)
              else openPicker()
            }
          }}
        >
          <span className="dsh-chat-suggest-dots" aria-hidden>
            {(['eager', 'standard', 'conservative'] as const).map((level, index) => (
              <span
                key={level}
                className={DOT_LIT_COUNT[sensitivity] > 2 - index ? 'dsh-chat-suggest-dot dsh-chat-suggest-dot-on' : 'dsh-chat-suggest-dot'}
              />
            ))}
          </span>
          <span
            className={pickerOpen ? 'dsh-chat-suggest-switch-arrow dsh-chat-suggest-switch-arrow-open' : 'dsh-chat-suggest-switch-arrow'}
            aria-hidden
          >
            <IconChevronDownOutline14 size={12} />
          </span>
        </span>
      </button>
      {error !== null ? (
        <span style={{ color: 'var(--dsw-alias-state-warning-primary, #d9822b)', fontSize: 12 }} title={error}>⚠</span>
      ) : null}
      {pickerOpen && pickerPoint !== null
        ? createPortal(
          <div
            className="dsh-chat-suggest-sensitivity-popover"
            role="listbox"
            aria-label={t('sensitivity.aria', { label: '' })}
            style={{
              left: pickerPoint.x,
              top: pickerPoint.y,
              transform: pickerPoint.up ? 'translateX(-100%) translateY(-100%)' : 'translateX(-100%)',
            }}
            onMouseDown={(event) => {
              // 防止点按把焦点从输入框夺走（combobox 惯例）。
              event.preventDefault()
            }}
          >
            {(['eager', 'standard', 'conservative'] as const).map(level => (
              <button
                key={level}
                type="button"
                role="option"
                aria-selected={level === sensitivity}
                className={level === sensitivity ? 'dsh-chat-suggest-sensitivity-option dsh-chat-suggest-sensitivity-option-on' : 'dsh-chat-suggest-sensitivity-option'}
                onClick={() => {
                  setTriggerSensitivity(level)
                  setPickerOpen(false)
                }}
              >
                <span className="dsh-chat-suggest-sensitivity-option-check" aria-hidden>{level === sensitivity ? '✓' : ''}</span>
                <span>{t(`sensitivity.${level}`)}</span>
                <span className="dsh-chat-suggest-sensitivity-option-rule">{t(`sensitivity.${level}.rule`)}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
        : null}
    </>
  )
}

/**
 * 数据面（挂在 conversation.input.dock）：读 InputZone 草稿快照 → 停顿后请求
 * FIM → 把「建议 + 快照」写共享 store；可见 UI 由 overlay 菜单与开关渲染。
 * 继续输入 / 发送 / 相位变化都会清空旧建议；联想中时渲染 composer 卡片外圈旋转紫光。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function ChatSuggestDock(props: ChatSuggestDockProps) {
  const { session, input, requestComplete, isSupported } = props
  const [composing, setComposing] = useState(false)
  const [ring, setRing] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const enabled = useSuggestEnabled()
  const busy = useSuggestBusy()
  const supported = useSuggestSupported()
  const sensitivity = useTriggerSensitivity()
  const sensitivityParams = TRIGGER_SENSITIVITIES[sensitivity]

  // 会话切换时查询主模型支持状态；不支持则整体隐藏（像没装插件）。
  useEffect(() => {
    setSuggestSupported(true)
    let alive = true
    void isSupported(session.sessionId).then((next) => {
      if (alive) setSuggestSupported(next)
    }).catch(() => {
      // 查询失败默认显示。
    })
    return () => { alive = false }
  }, [isSupported, session.sessionId])

  const composingRef = useRef(false)
  const draftRevRef = useRef(input.draftRev)
  const draftRef = useRef(input.draft)
  const flightRef = useRef<AbortController | null>(null)
  draftRevRef.current = input.draftRev
  draftRef.current = input.draft

  useEffect(() => {
    const start = (): void => {
      composingRef.current = true
      setComposing(true)
    }
    const end = (): void => {
      composingRef.current = false
      setComposing(false)
    }
    document.addEventListener('compositionstart', start)
    document.addEventListener('compositionend', end)
    return () => {
      document.removeEventListener('compositionstart', start)
      document.removeEventListener('compositionend', end)
      flightRef.current?.abort()
      setSuggestBusy(false)
      setSuggestion(null)
    }
  }, [])

  useEffect(() => {
    setSuggestion(null)
    setSuggestBusy(false)
    setSuggestError(null)
    flightRef.current?.abort()

    const draft = input.draft
    // 形态门控：句末标点 / 尾随空白 / 单词中间 / 过短草稿按触发灵敏度三档伸缩。
    if (!supported || !enabled || composing || input.phase !== 'plain') return
    // Tab 采纳后的草稿变化：消费采纳标记后继续走触发流程——前缀机制从草稿尾部续写，
    // 不会复现旧建议（FIM 时代「建议马上复现」的问题已随上游切换失效），Tab 链式续写由此成立；
    // 采纳文本以句末标点结尾时，中/低档门控自然抑制链式触发，高档（句末标点也触发）可一直 Tab。
    const adoption = peekSuggestAdoption()
    if (adoption !== null && adoption.sessionId === session.sessionId && draft === adoption.draft + adoption.text) {
      clearSuggestAdoption()
    }
    if (!shouldTriggerSuggest(draft, sensitivity).ok) return

    const rev = input.draftRev
    const timer = setTimeout(() => {
      if (composingRef.current || rev !== draftRevRef.current || draftRef.current !== draft) return
      const controller = new AbortController()
      flightRef.current = controller
      setSuggestBusy(true)
      void requestComplete(session.sessionId, draft, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          if (rev !== draftRevRef.current || draftRef.current !== draft) return
          const text = result.suggestions[0]?.trim()
          if (text !== undefined && text !== '') {
            setSuggestion({
              text,
              sessionId: session.sessionId,
              draft,
              draftRev: rev,
              model: result.model,
              totalTokens: result.usage.promptTokens + result.usage.completionTokens,
              temperature: result.temperature,
            })
          }
          setSuggestError(null)
        })
        .catch((reason: unknown) => {
          // 失败可见化：禁用/凭据/上游错误显示在开关旁，而不是静默无建议。
          if (!controller.signal.aborted) {
            setSuggestError(reason instanceof Error ? reason.message : String(reason))
          }
        })
        .finally(() => {
          if (flightRef.current === controller) flightRef.current = null
          if (!controller.signal.aborted) setSuggestBusy(false)
        })
    }, sensitivityParams.pauseMs)

    return () => {
      clearTimeout(timer)
    }
  }, [composing, enabled, supported, sensitivity, sensitivityParams, input.draft, input.draftRev, input.phase, requestComplete, session.sessionId])

  // 联想中：整个 composer 卡片外圈旋转紫光（跟随卡片矩形，周期自愈）。
  useLayoutEffect(() => {
    if (!busy) {
      setRing(null)
      return
    }
    const measure = (): void => { setRing(composerCardRect() ?? null) }
    measure()
    const timer = window.setInterval(measure, RING_MEASURE_INTERVAL_MS)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [busy])

  return (
    <>
      {busy && ring !== null
        ? createPortal(
          <div
            className="dsh-chat-suggest-ring"
            style={{ left: ring.x - 2, top: ring.y - 2, width: ring.width + 4, height: ring.height + 4 }}
            aria-hidden
          />,
          document.body,
        )
        : null}
    </>
  )
}

/**
 * 候选菜单视图（挂在 conversation.input.overlay）：官方 @ 候选菜单同款悬浮卡，
 * 锚点由 shell 承载，零定位 JS。Tab / mousedown 点选采用，Esc 丢弃；
 * 官方触发菜单（@/斜杠，`[data-trigger-menu]`）打开期间完全隐藏并让出按键。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function ChatSuggestMenu(props: ChatSuggestMenuProps) {
  const { adopt, sessionId, t } = props
  const suggestion = useSuggestion()
  const enabled = useSuggestEnabled()
  const supported = useSuggestSupported()
  const [triggerOpen, setTriggerOpen] = useState(() => document.querySelector('[data-trigger-menu]') !== null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // 与官方触发菜单互斥：观察 overlay 锚点子树，官方菜单增删时实时刷新。
  useEffect(() => {
    const anchor = rootRef.current?.parentElement ?? null
    if (anchor === null) return
    const check = (): void => { setTriggerOpen(document.querySelector('[data-trigger-menu]') !== null) }
    check()
    const observer = new MutationObserver(check)
    observer.observe(anchor, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-trigger-menu'] })
    return () => { observer.disconnect() }
  }, [])

  // 建议归属校验：共享建议按会话写入，切会话后到 dock 清空之前有一帧窗口，
  // 渲染与采用都必须确认是本会话的建议，防止 Tab 把文本 bail 进旧会话草稿。
  const visible = suggestion !== null && enabled && supported && !triggerOpen && suggestion.sessionId === sessionId

  const adoptSuggestion = useCallback((): void => {
    if (suggestion === null || suggestion.sessionId !== sessionId) return
    // 双保险：官方触发菜单打开时绝不采用（Tab 归官方菜单下钻）。
    if (document.querySelector('[data-trigger-menu]') !== null) return
    const span: TokenSpan = {
      start: suggestion.draft.length,
      end: suggestion.draft.length,
      draftRev: suggestion.draftRev,
    }
    // 先记采纳标记：dock 据此跳过「旧草稿 + 建议文本」这一次触发；bail 失败则回滚。
    markSuggestAdoption({ sessionId: suggestion.sessionId, draft: suggestion.draft, text: suggestion.text })
    if (adopt(suggestion.sessionId, suggestion.text, span)) {
      setSuggestion(null)
      setSuggestBusy(false)
    } else {
      clearSuggestAdoption()
    }
  }, [adopt, sessionId, suggestion])

  // Tab 采用（仅焦点在 composer 卡内）/ Esc 丢弃（capture 抢先于输入机）；
  // 建议卡外 pointerdown 丢弃（官方触发菜单同款行为）。
  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // 焦点不在输入区（例如刚点过聊天消息）时不劫持 Tab 走焦。
        const active = document.activeElement
        if (active instanceof HTMLElement && active.closest('[data-composer-card]') === null) return
        event.preventDefault()
        adoptSuggestion()
      } else if (event.key === 'Escape') {
        setSuggestion(null)
      }
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest('.dsh-chat-suggest-menu') !== null) return
      if (event.target.closest('.dsh-chat-suggest-switch') !== null) return
      if (event.target.closest('.dsh-chat-suggest-sensitivity-popover') !== null) return
      setSuggestion(null)
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [visible, adoptSuggestion])

  const maxHeight = useAnchoredMaxHeight(cardRef, MENU_MAX_HEIGHT, visible ? suggestion : null)

  return (
    <div ref={rootRef} className="dsh-chat-suggest-menu-anchor">
      {visible && suggestion !== null ? (
        <div
          ref={cardRef}
          className="dsh-chat-suggest-menu"
          style={{ maxHeight }}
          role="listbox"
          aria-label={t('dock.aria')}
        >
          <button
            type="button"
            role="option"
            aria-selected="true"
            className="dsh-chat-suggest-menu-row"
            title={suggestion.text}
            // mousedown，不是 click：焦点保持在输入框（官方菜单同款 combobox 模式）。
            onMouseDown={(event) => {
              event.preventDefault()
              adoptSuggestion()
            }}
          >
            <span className="dsh-chat-suggest-menu-text">{suggestion.text}</span>
            <span className="dsh-chat-suggest-menu-trailing" aria-hidden>
              <span className="dsh-chat-suggest-menu-hint">{t('menu.adopt')}</span>
              <kbd className="dsh-chat-suggest-menu-kbd">Tab</kbd>
              <span className="dsh-chat-suggest-menu-hint">{t('menu.dismiss')}</span>
              <kbd className="dsh-chat-suggest-menu-kbd">Esc</kbd>
            </span>
          </button>
          <div className="dsh-chat-suggest-menu-footer">
            <span className="dsh-chat-suggest-menu-usage">
              {t('menu.tokens', {
                tokens: formatTokenCount(suggestion.totalTokens),
                model: suggestion.model,
                temperature: suggestion.temperature,
              })}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
