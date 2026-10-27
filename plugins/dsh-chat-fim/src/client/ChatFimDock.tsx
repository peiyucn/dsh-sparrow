/** FIM 续写：共享状态 + 开关（input.left）+ 数据面 dock（input.dock）+ @ 列表样式候选菜单（input.overlay）。 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useAnchoredMaxHeight, IconSparkleRegular, IconChevronDownOutlineRegular, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { ENABLED_STORAGE_KEY, MENU_MAX_HEIGHT, RING_MEASURE_INTERVAL_MS, SENSITIVITY_STORAGE_KEY } from '../constants.js'
import {
  TRIGGER_SENSITIVITIES, detectEndOfDraft, formatTokenCount, normalizeTriggerSensitivity, shouldTriggerSuggest,
  type TriggerSensitivity,
} from '../suggest.js'
import { anchorPointsEqual, rectsEqual } from './geometry.js'
import { createLazyDirectoryStore } from './lazy-directory-store.js'
import { CHAT_FIM_CLASS } from './styles.js'
import {
  fimSupportReducer, fimSupportRetryDelayMs, fimSupportShown, initialFimSupportState,
  type FimSupportEvent, type FimSupportState,
} from './fim-support-machine.js'

/** 类名表别名：JSX 与事件里的选择器都走它，不手写字符串。 */
const cls = CHAT_FIM_CLASS

export interface SuggestCompleteResult {
  readonly suggestions: readonly string[]
  readonly model: string
  readonly temperature: number
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number }
}

/** 官方共享模型目录 store 的最小面（与模型座位同 store：快照 + 订阅）。 */
export interface FimDirectoryStore {
  getSnapshot(): { current: { provider: string; model: string } | null }
  subscribe(listener: () => void): () => void
}

export interface ChatFimDockInjected {
  /** 注入面所属会话（槽工厂按 sessionId 生成）；菜单据此校验建议归属，堵跨会话误采用。 */
  readonly sessionId: SessionId
  /** 官方共享模型目录 store（ctx.modelDirectories）：选中模型与座位同源；目录不可用时 undefined。 */
  readonly directoryFor: (sessionId: SessionId) => FimDirectoryStore | undefined
  /** 查询当前会话主模型是否支持（deepseek 系列）；`null` = 宿主现在判不了（冷启动会话未激活等）。 */
  checkSupport: (sessionId: SessionId) => Promise<boolean | null>
  /** 发起一次 host 路由请求；由调用方负责陈旧响应判定。续写模型由 host 按主模型解析（auto 跟随）。 */
  requestComplete: (
    sessionId: SessionId,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<SuggestCompleteResult>
  /** 通过 scoped bail 事件把建议追加进草稿；返回是否被输入机接受。 */
  adopt: (sessionId: SessionId, text: string, span: TokenSpan) => boolean
}

export type ChatFimDockProps = PropsRuntime<'conversation.input.dock'> & ChatFimDockInjected & {
  t: TranslateNS<'chat-fim'>
  /** 会话标准 hook（ui-session 提供）；旧版 dsh 缺该 prop 时为 undefined。 */
  useProjection?: (key: string) => unknown
}
export type ChatFimSwitchProps = PropsRuntime<'conversation.input.left'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }
export type ChatFimMenuProps = PropsRuntime<'conversation.input.overlay'> & ChatFimDockInjected & { t: TranslateNS<'chat-fim'> }

/** 灵敏度弹层预宽：左缘对齐后向窗内钳制时用的宽度上界。 */
const PICKER_MAX_WIDTH = 360

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

// 模块级共享「联想中」状态：记录**哪个会话**在联想——环只由该会话的 dock 渲染，
// 后台会话的在途请求不会把环画到当前会话上（按会话隔离）。
let sharedBusySessionId: string | null = null
const busyListeners = new Set<() => void>()

/**
 * 订阅共享联想中状态。
 * @param sessionId - 指定时只反映该会话是否在联想；省略时反映「任意会话在联想」（开关胶囊用）。
 * @returns 该会话（或任意会话）是否正在联想。
 */
export function useSuggestBusy(sessionId?: string): boolean {
  const read = (): boolean => sessionId === undefined ? sharedBusySessionId !== null : sharedBusySessionId === sessionId
  const [value, setValue] = useState(read)
  useEffect(() => {
    const listener = (): void => { setValue(read()) }
    busyListeners.add(listener)
    return () => { busyListeners.delete(listener) }
    // read 随 sessionId 闭包变化：sessionId 变更时重挂监听（并立即以新会话重算）。
  }, [sessionId])
  return value
}

/** 设置共享联想中会话（null = 无）。 */
export function setSuggestBusy(sessionId: string | null): void {
  if (sharedBusySessionId === sessionId) return
  sharedBusySessionId = sessionId
  for (const listener of busyListeners) listener()
}

/** 只在「当前在联想的正是这个会话」时清除——后台会话迟到的结束回调不得清掉当前会话的环。 */
export function clearSuggestBusy(sessionId: string): void {
  if (sharedBusySessionId !== sessionId) return
  setSuggestBusy(null)
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

// 模块级共享「模型支持」状态机：主模型非 deepseek 系列时整体隐藏（像没装插件）。
// 判定管线（idle → checking ⇄ retrying → supported/unsupported/failed）由
// fim-support-machine 的纯 reducer 驱动，事件带会话+模型地址，旧响应在状态机里被
// 结构性作废。「宿主判不了」（冷启动会话未激活）单独成相并做有界补查——不与
// 「判为不支持」混同，见 fim-support-machine 顶部注释。
let sharedSupport = initialFimSupportState
const supportListeners = new Set<() => void>()

/** 订阅共享模型支持状态机全量状态（dock 据此驱动查询）。 */
export function useSuggestSupportState(): FimSupportState {
  const [value, setValue] = useState(sharedSupport)
  useEffect(() => {
    const listener = (): void => { setValue(sharedSupport) }
    supportListeners.add(listener)
    return () => { supportListeners.delete(listener) }
  }, [])
  return value
}

/** 订阅共享模型支持布尔态（开关/菜单只关心显隐）。 */
export function useSuggestSupported(): boolean {
  return fimSupportShown(useSuggestSupportState())
}

/** 派发支持状态机事件；reducer 判定无效事件（旧地址/阶段不符）并原样忽略。 */
export function dispatchSupportEvent(event: FimSupportEvent): void {
  const next = fimSupportReducer(sharedSupport, event)
  if (next === sharedSupport) return
  sharedSupport = next
  for (const listener of supportListeners) listener()
}

/** 一条「建议 + 生成它的草稿快照」：菜单视图据此渲染与采用（span CAS）。 */
export interface SuggestionRecord {
  readonly text: string
  readonly sessionId: SessionId
  readonly draft: string
  readonly draftRev: number
  /** 草稿末端在 detect 坐标（TokenSpan 平面）的偏移：@ 元素每个只占 1 字符，
   *  clipboard 展开长度必须扣除（detectEndOfDraft 口径）。 */
  readonly detectEnd: number
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

// 模块级共享触发灵敏度（开关胶囊 ▾ 选择器写入，dock 触发与请求时读取）。
// 非法值 / 读不到：都与 suggest.ts 的 normalizeTriggerSensitivity 同一套回退（standard），故不另写一份规则。
let sharedSensitivity: TriggerSensitivity = 'standard'
try {
  sharedSensitivity = normalizeTriggerSensitivity(window.localStorage.getItem(SENSITIVITY_STORAGE_KEY))
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

/**
 * 本 dock 所属会话的 composer 卡片视口矩形（旋转光环定位；只读测量）。
 *
 * 从**本会话根**（`[data-phase]`，官方公开 DOM 标记）里取卡片，而不是全局
 * `document.querySelector`——多会话并存时全局查询会取到别的会话的卡片，
 * 把环画到当前会话上。后台会话的卡片不可见时矩形为 0 → 不画环。
 * @param anchor - 本 dock 渲染的隐藏锚点（用于定位自己所在的会话根）。
 * @returns 视口矩形；取不到或不可见时 undefined。
 */
function composerCardRect(anchor: HTMLElement | null): { x: number; y: number; width: number; height: number } | undefined {
  const root = anchor?.closest('[data-phase]') ?? document
  const card = root.querySelector<HTMLElement>('[data-composer-card]')
  if (card === null) return undefined
  const rect = card.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** 输入框工具行左侧的开关胶囊（挂在 conversation.input.left）：点击切换开关，右侧 ▾ 弹出触发灵敏度三档。 */
export function ChatFimSwitch(props: ChatFimSwitchProps) {
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

  /** 依据开关胶囊矩形计算弹层锚点：左缘对齐开关（官方 Menu 的 start 对齐），贴右窗缘时向内钳制；空间不够向上弹出。 */
  const computePickerPoint = (): { x: number; y: number; up: boolean } | null => {
    const rect = switchRef.current?.getBoundingClientRect()
    if (rect === undefined) return null
    const estimate = 128 + 8
    const up = rect.bottom + estimate > window.innerHeight
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - 8 - PICKER_MAX_WIDTH))
    return { x, y: up ? rect.top - 4 : rect.bottom + 4, up }
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
      if (event.target.closest(`.${cls.sensitivityPopover}`) !== null) return
      if (switchRef.current !== null && switchRef.current.contains(event.target)) return
      setPickerOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPickerOpen(false)
    }
    const reposition = (): void => {
      const next = computePickerPoint()
      if (next === null) setPickerOpen(false)
      // 滚动事件高频（逐帧）：锚点数值无变化时不写状态，避免逐事件重渲染。
      else setPickerPoint(prev => (anchorPointsEqual(prev, next) ? prev : next))
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
        className={enabled ? `${cls.switch} ${cls.switchOn}` : `${cls.switch} ${cls.switchOff}`}
        title={busy ? t('dock.busy') : error ?? (enabled ? t('sensitivity.hint', { label }) : t('switch.offHint'))}
        aria-pressed={enabled}
        aria-busy={busy}
        onClick={() => {
          // 标签点击恒切换开关；弹层开着时一并收起（官方 PermissionSelect 触发器再点即合）。
          if (pickerOpen) setPickerOpen(false)
          setSuggestEnabled(!enabled)
        }}
      >
        <span className={cls.switchIcon} aria-hidden><IconSparkleRegular size={14} /></span>
        <span className={cls.switchLabel}>{t('switch.label')}</span>
        <span
          className={cls.switchPicker}
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
          <span className={cls.dots} aria-hidden>
            {(['eager', 'standard', 'conservative'] as const).map((level, index) => (
              <span
                key={level}
                className={DOT_LIT_COUNT[sensitivity] > 2 - index ? `${cls.dot} ${cls.dotOn}` : cls.dot}
              />
            ))}
          </span>
          <span
            className={pickerOpen ? `${cls.switchArrow} ${cls.switchArrowOpen}` : cls.switchArrow}
            aria-hidden
          >
            <IconChevronDownOutlineRegular size={12} />
          </span>
        </span>
      </button>
      {error !== null ? (
        <span className={cls.error} title={error}>⚠</span>
      ) : null}
      {pickerOpen && pickerPoint !== null
        ? createPortal(
          <MenuSurface
            className={cls.sensitivityPopover}
            role="listbox"
            aria-label={t('sensitivity.aria', { label: '' })}
            style={{
              left: pickerPoint.x,
              top: pickerPoint.y,
              transform: pickerPoint.up ? 'translateY(-100%)' : undefined,
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
                className={cls.sensitivityOption}
                onClick={() => {
                  setTriggerSensitivity(level)
                  setPickerOpen(false)
                }}
              >
                <span className={cls.sensitivityOptionCheck} aria-hidden>{level === sensitivity ? '✓' : ''}</span>
                <span>{t(`sensitivity.${level}`)}</span>
                <span className={cls.sensitivityOptionRule}>{t(`sensitivity.${level}.rule`)}</span>
              </button>
            ))}
          </MenuSurface>,
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
export function ChatFimDock(props: ChatFimDockProps) {
  const { session, input, requestComplete, checkSupport, directoryFor, useProjection } = props
  const [composing, setComposing] = useState(false)
  const [ring, setRing] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const enabled = useSuggestEnabled()
  const busy = useSuggestBusy(session.sessionId)
  const supported = useSuggestSupported()
  const supportState = useSuggestSupportState()
  const sensitivity = useTriggerSensitivity()
  const sensitivityParams = TRIGGER_SENSITIVITIES[sensitivity]
  /** 隐藏锚点：把环的测量范围限定在本会话（见 composerCardRect）。 */
  const anchorRef = useRef<HTMLSpanElement | null>(null)

  // 当前选中模型（与座位同源）：目录 store 惰性解析 + 会话投影兜底。
  // 模型一换，currentKey 就变 → 支持状态立即重查，开关随模型追平，
  // 不再只等切会话（旧实现只在 sessionId 变化时查）。
  const directoryAdapter = useMemo(
    () => createLazyDirectoryStore(directoryFor, session.sessionId),
    [directoryFor, session.sessionId],
  )
  const directoryCurrent = useSyncExternalStore(directoryAdapter.subscribe, directoryAdapter.getSnapshot)
  const projection = useProjection === undefined
    ? undefined
    : useProjection('modelSelection') as { next?: { provider: string; model: string } | null } | undefined
  const currentModel = directoryCurrent ?? projection?.next ?? null
  const currentKey = currentModel === null ? '' : `${currentModel.provider}:${currentModel.model}`

  // 会话/模型切换：支持状态机进入 checking（未定论前不显示，查完追平）。
  useEffect(() => {
    dispatchSupportEvent({
      type: 'context-changed',
      address: { sessionId: session.sessionId, modelKey: currentKey },
    })
  }, [session.sessionId, currentKey])

  // checking：按状态机地址发起一次支持查询；旧上下文的响应回来时
  // 状态机按地址作废（不需要 alive 标志）。
  useEffect(() => {
    if (supportState.phase !== 'checking') return
    const address = supportState.address
    void checkSupport(address.sessionId as SessionId).then(
      (next) => dispatchSupportEvent(
        next === null
          ? { type: 'unknown', address }
          : { type: 'checked', address, supported: next },
      ),
      () => { dispatchSupportEvent({ type: 'unknown', address }) },
    )
  }, [supportState.phase, supportState.address.sessionId, supportState.address.modelKey, checkSupport])

  // retrying：宿主判不了（冷启动时会话尚未激活 → 404），等待后补查。
  // 退避 + 次数有界（fim-support-machine 的常量）：会话激活后补查即拿定论，
  // 开关随所选模型追平；耗尽才落 failed 并 fail-open 显示。定时器随状态/地址重排，
  // 组件卸载与上下文切换都由清理函数撤销，不滞留。
  useEffect(() => {
    if (supportState.phase !== 'retrying') return
    const address = supportState.address
    const timer = setTimeout(() => {
      dispatchSupportEvent({ type: 'retry-tick', address })
    }, fimSupportRetryDelayMs(supportState.attempts))
    return () => { clearTimeout(timer) }
  }, [supportState.phase, supportState.address.sessionId, supportState.address.modelKey, supportState.attempts])

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
      clearSuggestBusy(session.sessionId)
      setSuggestion(null)
    }
  }, [])

  useEffect(() => {
    // 本会话 id 在此定格：会话切换时旧的 effect 清理要用**旧** id 撤销归属，
    // 否则环会一直挂在已离开的会话上（开关胶囊的 aria-busy 也跟着卡住）。
    const sessionId = session.sessionId
    setSuggestion(null)
    clearSuggestBusy(sessionId)
    setSuggestError(null)
    flightRef.current?.abort()

    const draft = input.draft
    // 形态门控：句末标点 / 尾随空白 / 单词中间 / 过短草稿按触发灵敏度三档伸缩。
    if (!supported || !enabled || composing || input.phase !== 'plain') return
    // Tab 采纳后的草稿变化：消费采纳标记后继续走触发流程——前缀机制从草稿尾部续写，
    // 不会复现旧建议（FIM 时代「建议马上复现」的问题已随上游切换失效），Tab 链式续写由此成立；
    // 采纳文本以句末标点结尾时，中/低档门控自然抑制链式触发，高档（句末标点也触发）可一直 Tab。
    const adoption = peekSuggestAdoption()
    if (adoption !== null && adoption.sessionId === sessionId && draft === adoption.draft + adoption.text) {
      clearSuggestAdoption()
    }
    if (!shouldTriggerSuggest(draft, sensitivity).ok) return

    const rev = input.draftRev
    const timer = setTimeout(() => {
      if (composingRef.current || rev !== draftRevRef.current || draftRef.current !== draft) return
      const controller = new AbortController()
      flightRef.current = controller
      setSuggestBusy(sessionId)
      void requestComplete(session.sessionId, draft, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          if (rev !== draftRevRef.current || draftRef.current !== draft) return
          const text = result.suggestions[0]?.trim()
          if (text !== undefined && text !== '') {
            setSuggestion({
              text,
              sessionId,
              draft,
              draftRev: rev,
              detectEnd: detectEndOfDraft(draft, input.occurrences),
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
          if (!controller.signal.aborted) clearSuggestBusy(sessionId)
        })
    }, sensitivityParams.pauseMs)

    return () => {
      clearTimeout(timer)
      // 会话切换/卸载：本会话在途请求作废，环的归属一并按**本会话**撤销
      // （abort 后 .finally 因 signal.aborted 不再清，故这里显式清）。
      flightRef.current?.abort()
      clearSuggestBusy(sessionId)
    }
  }, [composing, enabled, supported, sensitivity, sensitivityParams, input.draft, input.draftRev, input.phase, requestComplete, session.sessionId])

  // 联想中：整个 composer 卡片外圈旋转紫光（跟随卡片矩形，周期自愈）。
  // 矩形无变化时不写状态：300ms 周期 + resize/scroll（capture）回调会高频触发，
  // 逐拍写入新对象等于逐拍无意义重渲染（geometry.rectsEqual 去重）。
  useLayoutEffect(() => {
    if (!busy) {
      setRing(null)
      return
    }
    const measure = (): void => {
      const next = composerCardRect(anchorRef.current) ?? null
      setRing(prev => (rectsEqual(prev, next) ? prev : next))
    }
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
      {/* 隐藏锚点：把环的测量范围限定在本会话（composerCardRect 从它向上找会话根）。 */}
      <span ref={anchorRef} className={cls.anchor} aria-hidden />
      {busy && ring !== null
        ? createPortal(
          <div
            className={cls.ring}
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
export function ChatFimMenu(props: ChatFimMenuProps) {
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
    // span 用 detect 坐标（TokenSpan 平面）：@ 元素每个只占 1 字符，draft.length
    // 是 clipboard 坐标，含 @ 时会被官方 span 映射越界拒绝（Tab 失灵）；detectEnd
    // 在建议生成时按草稿快照扣除了 chip 的展开长度。
    const span: TokenSpan = {
      start: suggestion.detectEnd,
      end: suggestion.detectEnd,
      draftRev: suggestion.draftRev,
    }
    // 先记采纳标记：dock 据此跳过「旧草稿 + 建议文本」这一次触发；bail 失败则回滚。
    markSuggestAdoption({ sessionId: suggestion.sessionId, draft: suggestion.draft, text: suggestion.text })
    if (adopt(suggestion.sessionId, suggestion.text, span)) {
      setSuggestion(null)
      clearSuggestBusy(suggestion.sessionId)
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
      // 卡内任意位置（含底栏/空白）与开关/灵敏度弹层的 mousedown 都阻止默认焦点转移：
      // 否则点一下输入框就失焦到 body，后续 Tab 的焦点检查失败表现为「Tab 失灵」（2026-09-03）。
      if (event.target.closest(`.${cls.menu}`) !== null) {
        event.preventDefault()
        return
      }
      if (event.target.closest(`.${cls.switch}`) !== null) {
        event.preventDefault()
        return
      }
      if (event.target.closest(`.${cls.sensitivityPopover}`) !== null) {
        event.preventDefault()
        return
      }
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
    <div ref={rootRef} className={cls.menuAnchor}>
      {visible && suggestion !== null ? (
        <MenuSurface
          ref={cardRef}
          className={cls.menu}
          style={{ maxHeight }}
          role="listbox"
          aria-label={t('dock.aria')}
        >
          <button
            type="button"
            role="option"
            aria-selected="true"
            className={cls.menuRow}
            title={suggestion.text}
            // mousedown，不是 click：焦点保持在输入框（官方菜单同款 combobox 模式）。
            onMouseDown={(event) => {
              event.preventDefault()
              adoptSuggestion()
            }}
          >
            <span className={cls.menuText}>{suggestion.text}</span>
            <span className={cls.menuTrailing} aria-hidden>
              <span className={cls.menuHint}>{t('menu.adopt')}</span>
              <kbd className={cls.menuKbd}>Tab</kbd>
              <span className={cls.menuHint}>{t('menu.dismiss')}</span>
              <kbd className={cls.menuKbd}>Esc</kbd>
            </span>
          </button>
          <div className={cls.menuFooter}>
            <span className={cls.menuBrand}>🐦 dsh-sparrow</span>
            <span className={cls.menuUsage}>
              {t('menu.tokens', {
                tokens: formatTokenCount(suggestion.totalTokens),
                model: suggestion.model,
                temperature: suggestion.temperature,
              })}
            </span>
          </div>
        </MenuSurface>
      ) : null}
    </div>
  )
}
