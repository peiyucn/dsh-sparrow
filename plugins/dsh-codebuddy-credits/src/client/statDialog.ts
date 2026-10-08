/**
 * 积分弹层触发件的锚定座（官方 ui-chat 的 stat-dialog 不在 import 面内，这里用同一套
 * 公开 primitive 复刻其语义：`useAnchoredPosition` 定位 + `useDismissOnOutsidePointer`
 * 外点关闭与 Esc；皮肤见 CreditDialog.tsx）。
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'

/** 对齐官方 stat-dialog 的 PANEL_MARGIN。 */
const PANEL_MARGIN = 12
/** 对齐官方 stat-dialog 的 PANEL_GAP。 */
const PANEL_GAP = 8

/** 测尺寸前的兜底样式：不可见但仍参与布局（对齐官方 MEASURE_STYLE）。 */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

export interface CreditStatDialogSeat {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** 弹层本体（量尺寸用）。 */
  panelRef: RefObject<HTMLDivElement | null>
  /** 弹层的 fixed 定位坐标；首次测量前为 null（此时用 MEASURE_STYLE）。 */
  pos: CSSProperties | null
}

/** 座位用法：把 `pos ?? MEASURE_STYLE` 铺到 portal 出去的弹层上，panelRef 挂该弹层。 */
export function useCreditStatDialog(anchorRef: RefObject<HTMLElement | null>): CreditStatDialogSeat {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const pos = useAnchoredPosition({
    open,
    anchorRef,
    panelRef,
    side: 'top',
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
  })

  useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  return { open, setOpen, toggle: () => { setOpen(current => !current) }, panelRef, pos }
}

export { MEASURE_STYLE }
