

import { Fragment } from 'react'
import type { MutableRefObject } from 'react'
import { CodeBuddyMark } from './CodeBuddyMark.js'
import { formatCredits } from './format.js'
import { CCB_CLASS } from './styles.js'
import type { AnchorStyles } from './statDialog.js'

export interface CreditDialogProps {

  panelRef: MutableRefObject<HTMLDivElement | null>

  anchorName: string
  ariaLabel: string
  title: string
  credit: number
  callsLabel: string
  calls: number
  perCallLabel: string

  byModel: ReadonlyArray<{ model: string; credit: number; calls: number }>
}

export function CreditDialog({
  panelRef, anchorName, ariaLabel, title, credit, callsLabel, calls, perCallLabel, byModel,
}: CreditDialogProps) {
  return (
    <div ref={panelRef} role="dialog" aria-label={ariaLabel} className={CCB_CLASS.dialog} style={{ positionAnchor: anchorName } as AnchorStyles}>
      <div className={CCB_CLASS.dialogTitle}>
        <span className={CCB_CLASS.dialogTitleLabel}>
          <CodeBuddyMark size={14} />
          {title}
        </span>
        <span className={CCB_CLASS.dialogAmount}>{formatCredits(credit)}</span>
      </div>
      <div className={CCB_CLASS.dialogRule} aria-hidden />
      <dl className={CCB_CLASS.dialogDetails}>
        <dt className={CCB_CLASS.dialogTerm}>{callsLabel}</dt>
        <dd className={CCB_CLASS.dialogValue}>{String(calls)}</dd>
        {byModel.length > 0
          ? (
            <>
              <dt className={CCB_CLASS.dialogGroup}>{perCallLabel}</dt>
              {byModel.map((call, index) => (
                <Fragment key={index}>
                  <dt className={CCB_CLASS.dialogModel}>
                    {call.model}{call.calls > 1 ? ` ×${call.calls}` : ''}
                  </dt>
                  <dd className={CCB_CLASS.dialogValue}>{formatCredits(call.credit)}</dd>
                </Fragment>
              ))}
            </>
          )
          : null}
      </dl>
    </div>
  )
}
