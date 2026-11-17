

import { useLayoutEffect, useState } from 'react'
import { RING_MEASURE_INTERVAL_MS } from '../constants.js'
import { rectsEqual, type RectLike } from './geometry.js'

export type RingRect = RectLike


export function composerCardRect(anchor: HTMLElement | null): RingRect | undefined {
  const root = anchor?.closest('[data-phase]') ?? document
  const card = root.querySelector<HTMLElement>('[data-composer-card]')
  if (card === null) return undefined
  const rect = card.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}


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

  }, [busy])
  return ring
}
