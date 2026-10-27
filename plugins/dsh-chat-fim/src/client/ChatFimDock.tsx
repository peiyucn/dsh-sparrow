/**
 * FIM 续写数据面（挂在 conversation.input.dock）：读 InputZone 草稿快照 → 停顿后请求
 * FIM → 把「建议 + 快照」写共享 store；可见 UI 由 overlay 菜单与开关渲染。
 * 本文件只留编排与 DOM 挂载：共享 store 在 store.ts、环测量在 ring.ts、两个视图组件各自成文件。
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TRIGGER_SENSITIVITIES, detectEndOfDraft, shouldTriggerSuggest } from '../suggest.js'
import type { ChatFimDockProps } from './contracts.js'
import { fimSupportRetryDelayMs } from './fim-support-machine.js'
import { createLazyDirectoryStore } from './lazy-directory-store.js'
import { useRingRect } from './ring.js'
import {
  clearSuggestAdoption, clearSuggestBusy, dispatchSupportEvent, peekSuggestAdoption, setSuggestBusy,
  setSuggestError, setSuggestion, useSuggestBusy, useSuggestEnabled, useSuggestSupported,
  useSuggestSupportState, useTriggerSensitivity,
} from './store.js'
import { CHAT_FIM_CLASS } from './styles.js'

/** 类名表别名：JSX 与事件里的选择器都走它，不手写字符串。 */
const cls = CHAT_FIM_CLASS

/**
 * 数据面（挂在 conversation.input.dock）：读 InputZone 草稿快照 → 停顿后请求
 * FIM → 把「建议 + 快照」写共享 store；可见 UI 由 overlay 菜单与开关渲染。
 * 继续输入 / 发送 / 相位变化都会清空旧建议；联想中时渲染 composer 卡片外圈旋转紫光。
 * @param props - 槽位运行时 props + 注入动作。
 */
export function ChatFimDock(props: ChatFimDockProps) {
  const { session, input, requestComplete, checkSupport, directoryFor, useProjection } = props
  const [composing, setComposing] = useState(false)
  const enabled = useSuggestEnabled()
  const busy = useSuggestBusy(session.sessionId)
  const supported = useSuggestSupported()
  const supportState = useSuggestSupportState()
  const sensitivity = useTriggerSensitivity()
  const sensitivityParams = TRIGGER_SENSITIVITIES[sensitivity]
  /** 隐藏锚点：把环的测量范围限定在本会话（见 ring.ts 的 composerCardRect）。 */
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  /** 联想中：整个 composer 卡片外圈旋转紫光（跟随卡片矩形，周期自愈）。 */
  const ring = useRingRect(anchorRef, busy)

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
