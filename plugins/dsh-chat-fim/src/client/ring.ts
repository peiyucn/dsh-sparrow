/**
 * composer 卡片矩形测量（旋转光环定位）：只读测量 + 300ms 周期自愈。
 * 不订阅官方布局事件；矩形无变化时不写状态（见 geometry.rectsEqual）。
 */

import { useLayoutEffect, useState } from 'react'
import { RING_MEASURE_INTERVAL_MS } from '../constants.js'
import { rectsEqual, type RectLike } from './geometry.js'

export type RingRect = RectLike

/**
 * 本 dock 所属会话的 composer 卡片视口矩形（旋转光环定位；只读测量）。
 *
 * 从**本会话根**（`[data-phase]`，官方公开 DOM 标记）里取卡片，而不是全局
 * `document.querySelector`——多会话并存时全局查询会取到别的会话的卡片，
 * 把环画到当前会话上。后台会话的卡片不可见时矩形为 0 → 不画环。
 * @param anchor - 本 dock 渲染的隐藏锚点（用于定位自己所在的会话根）。
 * @returns 视口矩形；取不到或不可见时 undefined。
 */
export function composerCardRect(anchor: HTMLElement | null): RingRect | undefined {
  const root = anchor?.closest('[data-phase]') ?? document
  const card = root.querySelector<HTMLElement>('[data-composer-card]')
  if (card === null) return undefined
  const rect = card.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/**
 * 联想中时持续测量本会话卡片矩形：挂载即测一次，随后 300ms 一拍 + resize / scroll（capture）自愈，
 * 卸载或 busy 结束时清掉定时器与监听。
 * @param anchorRef - 本 dock 的隐藏锚点（会话根定位用）。
 * @param busy - 是否正在联想（false 时矩形归 null、不测量）。
 * @returns 当前卡片矩形；未联想或测不到时 null。
 */
export function useRingRect(
  anchorRef: { readonly current: HTMLElement | null },
  busy: boolean,
): RingRect | null {
  const [ring, setRing] = useState<RingRect | null>(null)
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
    // 与拆分前一致：只随 busy 重排（anchorRef 是稳定 ref）。
  }, [busy])
  return ring
}
