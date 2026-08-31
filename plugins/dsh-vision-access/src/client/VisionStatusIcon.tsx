/** 状态图标：当前会话可跨模型读图时在模型选择器旁点亮；点击弹说明（非视觉模型才显示）。 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

export interface VisionStatusResult {
  readonly available: boolean
  /** host 实际配置的视觉模型 id（弹窗里明示发往哪个模型）。 */
  readonly visionModel: string
}

export interface VisionStatusInjected {
  /** host 状态查询：当前会话主模型是否为「DeepSeek 文本模型」+ 实际视觉模型。 */
  queryStatus: (sessionId: SessionId) => Promise<VisionStatusResult>
}

export type VisionStatusProps = PropsRuntime<'conversation.input.right'> & VisionStatusInjected & { t: TranslateNS<'vision-access'> }

/** 眼睛 glyph：官方 icon 集无眼睛图标，内联 SVG + currentColor（同官方 PermissionSelect 自绘盾牌先例）。 */
const EYE_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

/** 注入图标与说明弹窗样式（按 data 属性去重）；返回 style 元素供卸载清理。 */
export function ensureVisionStyles(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-vision-access]')
  if (existing !== null) return existing
  const style = document.createElement('style')
  style.dataset.dshVisionAccess = ''
  style.textContent = `
.dsh-vision-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 24px;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-vision-status:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-vision-status-label {
  color: var(--dsw-alias-label-secondary);
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
  box-shadow: var(--dsw-shadow-lv3);
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

export function VisionStatusIcon({ session, queryStatus, t }: VisionStatusProps) {
  const [status, setStatus] = useState<VisionStatusResult | null>(null)
  const [open, setOpen] = useState(false)
  const [point, setPoint] = useState<{ x: number; y: number; up: boolean } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // 会话切换时查询 host 状态；查询失败默认隐藏（保守，不影响主流程）。
  useEffect(() => {
    setStatus(null)
    setOpen(false)
    let alive = true
    void queryStatus(session.sessionId).then((next) => {
      if (alive) setStatus(next)
    }).catch(() => {
      // 状态查询失败：不显示图标。
    })
    return () => { alive = false }
  }, [queryStatus, session.sessionId])

  const computePoint = (): { x: number; y: number; up: boolean } | null => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect === undefined) return null
    const estimate = 96 + 8
    const up = rect.bottom + estimate > window.innerHeight
    return { x: rect.right, y: up ? rect.top - 4 : rect.bottom + 4, up }
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

  if (status === null || !status.available) return null
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="dsh-vision-status"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          if (open) setOpen(false)
          else {
            setPoint(computePoint())
            setOpen(true)
          }
        }}
      >
        {EYE_GLYPH}
        <span className="dsh-vision-status-label">{t('icon.label')}</span>
      </button>
      {open && point !== null
        ? createPortal(
          <div
            className="dsh-vision-popover"
            role="dialog"
            aria-label={t('popover.title')}
            style={{
              left: point.x,
              top: point.y,
              transform: point.up ? 'translateX(-100%) translateY(-100%)' : 'translateX(-100%)',
            }}
          >
            <div className="dsh-vision-popover-title">{t('popover.title')}</div>
            <div className="dsh-vision-popover-body">{t('popover.body', { model: status.visionModel })}</div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
