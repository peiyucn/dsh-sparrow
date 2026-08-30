/** 状态图标：当前会话可跨模型读图时在输入框工具行点亮（纯指示，无交互、无持久状态）。 */

import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

export interface VisionStatusInjected {
  /** host 状态查询：当前会话主模型是否为「DeepSeek 文本模型」（vision_read 可用）。 */
  isAvailable: (sessionId: SessionId) => Promise<boolean>
}

export type VisionStatusProps = PropsRuntime<'conversation.input.left'> & VisionStatusInjected & { t: TranslateNS<'vision-access'> }

/** 图片 glyph：官方 icon 集没有图片图标，内联 SVG + currentColor（同官方 PermissionSelect 自绘盾牌先例）。 */
const IMAGE_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5.6" cy="6" r="1.2" stroke="currentColor" strokeWidth="1.2" />
    <path d="M2.6 12.4L6.6 8.4L9.6 10.9L11.6 8.9L13.4 11.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function VisionStatusIcon({ session, isAvailable, t }: VisionStatusProps) {
  const [available, setAvailable] = useState(false)

  // 会话切换时查询 host 状态；查询失败默认隐藏（保守，不影响主流程）。
  useEffect(() => {
    setAvailable(false)
    let alive = true
    void isAvailable(session.sessionId).then((next) => {
      if (alive) setAvailable(next)
    }).catch(() => {
      // 状态查询失败：不显示图标。
    })
    return () => { alive = false }
  }, [isAvailable, session.sessionId])

  if (!available) return null
  return (
    <span
      role="img"
      aria-label={t('icon.hint')}
      title={t('icon.hint')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flex: 'none',
        color: 'var(--dsw-alias-button-info-fill, #4d6bfe)',
        cursor: 'help',
      }}
    >
      {IMAGE_GLYPH}
    </span>
  )
}
