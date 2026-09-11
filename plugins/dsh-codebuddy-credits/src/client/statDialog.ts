/**
 * 积分弹层的触发件锚定座（官方 ui-chat 的 stat-dialog.ts 不在插件的 import
 * 面内，这里用同一套**公开** primitive 复刻同一语义）：
 * - 定位：`useAnchoredPosition`（side=top / gap 8 / margin 12，量到弹层真实
 *   尺寸后在视口内钳制；滚动与缩放跟随重定位）；
 * - 关闭：`useDismissOnOutsidePointer`（外点；触发件与弹层都算「内部」）+ Esc。
 * 弹层皮肤见 CreditDialog.tsx（材质对齐官方 stat-dialog.module.css）。
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'

/** 弹层与视口边缘的距离（官方 stat-dialog 的 PANEL_MARGIN）。 */
const PANEL_MARGIN = 12
/** 弹层与触发件之间的距离（官方 stat-dialog 的 PANEL_GAP）。 */
const PANEL_GAP = 8

/** 未定位的弹层：不可见但仍参与布局，让钳制量到真实尺寸（官方 MEASURE_STYLE）。 */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/** 一个触发件弹层的座位：开合状态与钳制定位。 */
export interface CreditStatDialogSeat {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** 弹层本体（量尺寸用）。 */
  panelRef: RefObject<HTMLDivElement | null>
  /** 弹层的 fixed 定位坐标；首次测量前为 null（此时用 MEASURE_STYLE）。 */
  pos: CSSProperties | null
}

/**
 * 触发件锚定的弹层座（每轮积分胶囊与会话积分胶囊共用）。
 * @param anchorRef - 触发件元素（弹层锚点，也是外点关闭判定的「内部」）。
 * @returns 座位；把 `pos ?? MEASURE_STYLE` 铺到 portal 出去的弹层上。
 */
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
