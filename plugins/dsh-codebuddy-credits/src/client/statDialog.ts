

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject, RefObject } from 'react'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'


export interface AnchorStyles extends CSSProperties {
  anchorName?: string
  positionAnchor?: string
}

export interface CreditStatDialogSeat {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void

  panelRef: MutableRefObject<HTMLDivElement | null>

  anchorName: string
}


export function useCreditStatDialog(anchorRef: RefObject<HTMLElement | null>): CreditStatDialogSeat {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const anchorName = `--ccb-stat-${useId().replaceAll(':', '')}`



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
