/** 状态图标：模型选择器旁的眼睛，随当前模型能力变化颜色与文案（DeepSeek 模型都显示）。 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

/** 图标状态：cross-model=可跨模型读图（蓝紫点亮）；native-vision=原生视觉（灰显）；no-vision=无视觉能力（带斜线）。 */
export type VisionStatusMode = 'cross-model' | 'native-vision' | 'no-vision'

export interface VisionStatusResult {
  readonly mode: VisionStatusMode
  /** host 实际配置的视觉模型 id（cross-model 弹窗里明示发往哪个模型）。 */
  readonly visionModel: string
  /** host 是否给出定论（模型事实已装载）；false = 能力未知，会短时补查自愈。 */
  readonly declared: boolean
}

/** 能力未知（declared:false）时的补查间隔与次数上限——provider 目录启动期
 *  未就绪的假阴性会在几秒内被纠正，不把图标锁在错误状态。 */
const CAPABILITY_UNKNOWN_RETRY_MS = 2_500
const CAPABILITY_UNKNOWN_RETRIES = 4

/** 弹层定位常量：高度估算 96px（264px 宽说明卡）、翻转判定余量 8px、
 *  离按钮间距 4px。 */
const POPOVER_HEIGHT_ESTIMATE = 96
const POPOVER_FLIP_MARGIN = 8
const POPOVER_GAP = 4

/** 官方共享模型目录 store 的最小面（与模型座位同 store：快照 + 订阅）。 */
export interface DirectoryStore {
  getSnapshot(): { current: { provider: string; model: string } | null }
  subscribe(listener: () => void): () => void
}

export interface VisionStatusInjected {
  /** 官方共享模型目录 store（ctx.modelDirectories）：当前选中模型与座位同源；目录不可用时 undefined。 */
  directoryFor: (sessionId: SessionId) => DirectoryStore | undefined
  /** host 能力查询：按 provider/model 取模式 + 视觉模型 id（client 进程内缓存；空参=host 默认模型兜底）。 */
  queryCapability: (provider: string, model: string) => Promise<VisionStatusResult>
}

/** 官方 session 标准 hook useProjection 的最小面（旧版 dsh 未提供该 prop 时为 undefined）。 */
export interface ModelSelectionProjectionLike {
  /** 持久化选择：pending ?? lastUsed；空白会话为 null。 */
  readonly next?: { provider: string; model: string } | null
}

export type VisionStatusProps = PropsRuntime<'conversation.input.right'> & VisionStatusInjected & {
  t: TranslateNS<'vision-bridge'>
  sessionId?: SessionId
  /** 会话标准 hook（ui-session 提供）；旧版 dsh 缺该 prop 时为 undefined。 */
  useProjection?: (key: string) => unknown
}

/**
 * 官方共享模型目录的惰性读取面（与模型座位同 store、含模型选择乐观回写）。
 * 首次渲染时会话 scope 可能尚未就绪、directoryFor 会抛错——一次失败不弃权：
 * getSnapshot/subscribe 每次读取重试（credits 遮蔽选择器同款惰性解析），
 * 解析成功后通知等待中的订阅者。
 */
function createLazyDirectoryStore(
  directoryFor: VisionStatusInjected['directoryFor'],
  sessionId: SessionId | undefined,
): { getSnapshot: () => { provider: string; model: string } | null; subscribe: (listener: () => void) => () => void } {
  let resolved: DirectoryStore | undefined
  const pending = new Set<() => void>()
  const ensure = (): DirectoryStore | undefined => {
    if (resolved !== undefined) return resolved
    if (sessionId === undefined) return undefined
    try {
      const hit = directoryFor(sessionId)
      if (hit !== undefined) {
        resolved = hit
        for (const listener of pending) listener()
        pending.clear()
      }
    } catch {
      // 会话 scope 尚未就绪：保持未决，下一次读取重试。
    }
    return resolved
  }
  return {
    getSnapshot: () => ensure()?.getSnapshot().current ?? null,
    subscribe: (listener) => {
      const hit = ensure()
      if (hit !== undefined) return hit.subscribe(listener)
      pending.add(listener)
      return () => { pending.delete(listener) }
    },
  }
}

/** 眼睛 glyph：官方 icon 集无眼睛图标，内联 SVG + currentColor（同官方 PermissionSelect 自绘盾牌先例）。 */
const EYE_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

/** 带斜线的眼睛（无视觉能力降级态）。 */
const EYE_OFF_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.5" />
    <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <line x1="3.4" y1="12.6" x2="12.6" y2="3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

/** 注入图标与说明弹窗样式（按 data 属性去重）；返回 style 元素供卸载清理。 */
export function ensureVisionStyles(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-vision-bridge]')
  if (existing !== null) return existing
  const style = document.createElement('style')
  style.dataset.dshVisionBridge = ''
  style.textContent = `
.dsh-vision-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 28px;
  corner-shape: round;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
  font-family: inherit;
  /* 拉近与右侧模型选择框的距离（紧贴模型选择器，owner 拍板再贴近）。 */
  margin-right: -4px;
}
.dsh-vision-status:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
/* 原生视觉模型：灰显，与官方其它控件文字同色。 */
.dsh-vision-status-native {
  color: var(--dsw-alias-label-secondary);
}
/* 无视觉能力（降级）：更暗 + 斜线。 */
.dsh-vision-status-none {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-vision-popover {
  position: fixed;
  z-index: 2100;
  box-sizing: border-box;
  width: 264px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--dsw-alias-border-inverted);
  border-radius: 12px;
  background: var(--dsw-specific-menu);
  box-shadow: var(--dsw-elevation-prominent, 0 12px 40px rgba(0,0,0,0.22));
}
.dsh-vision-popover-title {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dsh-vision-popover-body {
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
`
  document.head.appendChild(style)
  return style
}

export function VisionStatusIcon({ sessionId, directoryFor, queryCapability, useProjection, t }: VisionStatusProps) {
  const [status, setStatus] = useState<VisionStatusResult | null>(null)
  const [open, setOpen] = useState(false)
  const [point, setPoint] = useState<{ x: number; y: number; up: boolean } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // 会话持久化模型选择投影（官方会话标准 hook；旧版 dsh 未提供时为 undefined）。
  // next = pending ?? lastUsed——与座位展示的当前模型同一来源。
  const projection = useProjection === undefined
    ? undefined
    : useProjection('modelSelection') as ModelSelectionProjectionLike | undefined

  // 官方共享模型目录（与模型座位同 store、含模型选择乐观回写）；惰性重试解析。
  const directoryAdapter = useMemo(
    () => createLazyDirectoryStore(directoryFor, sessionId),
    [directoryFor, sessionId],
  )
  const directoryCurrent = useSyncExternalStore(
    directoryAdapter.subscribe,
    directoryAdapter.getSnapshot,
  )

  // 生效模型：目录（座位同源，含乐观回写）→ 会话投影（持久化选择）→ null（默认兜底）。
  const effective = directoryCurrent ?? projection?.next ?? null
  const effectiveKey = effective === null ? '' : `${effective.provider}:${effective.model}`

  // 模型变化 / 会话切换时查能力：缓存命中立即上色；未命中保持上一状态直到新结果
  // （避免闪烁），失败隐藏（保守）。目录/投影都未解析（空白会话、历史未装载窗口）
  // 时按共享默认模型兜底——该窗口内 composer 实际生效的就是默认模型，就位后自动
  // 纠正为会话真实模型。host 报 declared:false（模型事实未装载）时有限次补查自愈
  // （启动期假阴性如 hy4 先答 no-vision，几秒内纠正）。
  useEffect(() => {
    setOpen(false)
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const query = (): void => {
      const request = effective === null
        ? queryCapability('', '')
        : queryCapability(effective.provider, effective.model)
      void request.then((next) => {
        if (!alive) return
        setStatus(next)
        if (!next.declared && attempts < CAPABILITY_UNKNOWN_RETRIES) {
          attempts += 1
          timer = setTimeout(query, CAPABILITY_UNKNOWN_RETRY_MS)
        }
      }).catch(() => {
        // 状态查询失败：隐藏图标。
        if (alive) setStatus(null)
      })
    }
    query()
    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [effectiveKey, queryCapability])

  const computePoint = (): { x: number; y: number; up: boolean } | null => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect === undefined) return null
    const up = rect.bottom + POPOVER_HEIGHT_ESTIMATE + POPOVER_FLIP_MARGIN > window.innerHeight
    return { x: rect.right, y: up ? rect.top - POPOVER_GAP : rect.bottom + POPOVER_GAP, up }
  }

  // 弹层打开时：点外部关闭、Esc 关闭、滚动/缩放跟随重定位（官方下拉同款行为）。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest('.dsh-vision-popover') !== null) return
      if (buttonRef.current !== null && buttonRef.current.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const reposition = (): void => {
      const next = computePoint()
      if (next === null) setOpen(false)
      else setPoint(next)
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
  }, [open])

  const native = status?.mode === 'native-vision'
  const noVision = status?.mode === 'no-vision'
  // 能力查询未返回 / 查询失败 → 隐藏（不显示占位色）。
  if (status === null) return null
  const title = native ? t('popover.nativeVision.title') : noVision ? t('popover.noVision.title') : t('popover.crossModel.title')
  const buttonClass = native
    ? 'dsh-vision-status dsh-vision-status-native'
    : noVision
      ? 'dsh-vision-status dsh-vision-status-none'
      : 'dsh-vision-status'
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={title}
        onClick={(event) => {
          event.stopPropagation()
          if (open) setOpen(false)
          else {
            setPoint(computePoint())
            setOpen(true)
          }
        }}
      >
        {noVision ? EYE_OFF_GLYPH : EYE_GLYPH}
      </button>
      {open && point !== null
        ? createPortal(
          <div
            className="dsh-vision-popover"
            role="dialog"
            aria-label={title}
            style={{
              left: point.x,
              top: point.y,
              transform: point.up ? 'translateX(-100%) translateY(-100%)' : 'translateX(-100%)',
            }}
          >
            <div className="dsh-vision-popover-title">{title}</div>
            <div className="dsh-vision-popover-body">
              {native
                ? t('popover.nativeVision.body')
                : noVision
                  ? t('popover.noVision.body')
                  : t('popover.crossModel.body', { model: status.visionModel })}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
