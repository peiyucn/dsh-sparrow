

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { CreditDialog } from './CreditDialog.js'
import { useCreditStatDialog, type AnchorStyles } from './statDialog.js'
import { fetchLocal } from './fetch-timeout.js'
import { formatCredits } from './format.js'
import { API_PREFIX } from '../constants.js'
import { CCB_CLASS } from './styles.js'

const TURN_USAGE_URL = `${API_PREFIX}/turn-usage`


export interface TurnUsageView {
  credit: number
  calls: number

  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}


interface SnapshotLike {
  order?: readonly string[]
  nodes?: {
    get(key: string): {
      kind?: string
      data?: { turn?: number; closing?: { finalNode?: { messageId?: string } } | null }
    } | undefined
  }
}

export interface CodeBuddyTurnCreditProps {
  t: (key: string, vars?: Record<string, string>) => string

  messageId: string

  sessionId: string

  useChat: <T>(selector: (snapshot: SnapshotLike) => T) => T
}

export function CodeBuddyTurnCredit({ t, messageId, sessionId, useChat }: CodeBuddyTurnCreditProps) {
  const [usage, setUsage] = useState<TurnUsageView | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const { open, toggle, panelRef, anchorName } = useCreditStatDialog(buttonRef)


  useEffect(() => {
    const pill = buttonRef.current
    if (pill === null) return
    const row = pill.parentElement
    if (row === null || row.lastElementChild === pill) return
    row.appendChild(pill)
  })



  const turn = useChat((snapshot) => {
    const nodes = snapshot.nodes
    if (nodes === undefined) return null
    for (const key of snapshot.order ?? []) {
      const node = nodes.get(key)
      if (node?.kind === 'turn-tail' && node.data?.closing?.finalNode?.messageId === messageId) {
        return node.data.turn ?? null
      }
    }
    return null
  })

  useEffect(() => {
    if (turn === null || turn === undefined) return
    let alive = true
    void fetchLocal(`${TURN_USAGE_URL}?sessionId=${encodeURIComponent(sessionId)}&turn=${turn}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<TurnUsageView> : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => { if (alive) setUsage(value) })
      .catch(() => { if (alive) setUsage(undefined) })
    return () => { alive = false }
  }, [sessionId, turn])


  if (usage === undefined || usage.calls === 0) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={CCB_CLASS.turnTrigger}
        style={{ anchorName } as AnchorStyles}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('turnCredit.aria', { credit: formatCredits(usage.credit) })}
        onClick={toggle}
      >
        <CodeBuddyMark />
        <span className={CCB_CLASS.turnLabel}>{t('turnCredit.label', { credit: formatCredits(usage.credit) })}</span>
      </button>
      {open
        ? createPortal(
          <CreditDialog
            panelRef={panelRef}
            anchorName={anchorName}
            ariaLabel={t('turnCredit.title')}
            title={t('turnCredit.title')}
            credit={usage.credit}
            callsLabel={t('turnCredit.calls')}
            calls={usage.calls}
            perCallLabel={t('turnCredit.perCall')}
            byModel={usage.byModel}
          />,
          document.body,
        )
        : null}
    </>
  )
}
