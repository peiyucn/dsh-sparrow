/**
 * 积分弹层触发件的锚定座。
 *
 * 对齐官方 rc.3 的做法（官方 ui-chat 的 `stat-dialog` 不在 import 面内，这里用同一套公开
 * primitive 复刻其语义）：**CSS Anchor Positioning** —— `useId` 派生一个 anchor name，
 * 触发件把它挂到 `anchorName`，portal 出去的弹层挂 `positionAnchor`，落位与兜底全部由
 * styles.ts 里的 `@position-try` 规则负责；外点关闭与 Esc 仍走官方 primitive。
 */

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject, RefObject } from 'react'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * React 18 的 CSSProperties 尚未收录 CSS 锚点属性；这里用最小交叉类型表达，
 * 调用方以 `style={{ anchorName }}` / `style={{ positionAnchor }}` 使用。
 */
export interface AnchorStyles extends CSSProperties {
  anchorName?: string
  positionAnchor?: string
}

export interface CreditStatDialogSeat {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** 弹层本体（外点关闭判定 / portal 挂载点）。 */
  panelRef: MutableRefObject<HTMLDivElement | null>
  /** 触发件要挂到 `style.anchorName` 的锚点名。 */
  anchorName: string
}

/**
 * 一条积分弹层的锚定座：开合状态、CSS 锚点身份、外点关闭与 Esc。
 * @param anchorRef - 触发件元素（也用于外点关闭的「内部」判定）。
 * @returns 座位；把 `anchorName` 挂到触发件、`positionAnchor` 挂到弹层。
 */
export function useCreditStatDialog(anchorRef: RefObject<HTMLElement | null>): CreditStatDialogSeat {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const anchorName = `--ccb-stat-${useId().replaceAll(':', '')}`

  // 外点关闭走共享 primitive（portal 弹层算内部）；键盘激活兄弟触发件只发 click、不发
  // pointerdown，故再补一个捕获阶段 click，让本弹层先关、兄弟再开。Esc 关闭。
  useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent): void => {
      if (event.target instanceof Node
        && anchorRef.current?.contains(event.target) !== true
        && panelRef.current?.contains(event.target) !== true) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick, true)
    }
  }, [anchorRef, open])

  return { open, setOpen, toggle: () => { setOpen(current => !current) }, panelRef, anchorName }
}
