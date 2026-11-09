/** Two-click confirmation button shared by archive and active session rows. */
import type { ReactElement } from 'react'

export function ConfirmButton(props: {
  readonly label: string
  readonly confirmLabel: string
  readonly armed: boolean
  readonly danger?: boolean
  readonly disabled?: boolean
  readonly onArm: () => void
  readonly onConfirm: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className="dsh-desk-archive-action"
      data-danger={props.danger === true ? 'true' : undefined}
      disabled={props.disabled === true}
      onClick={() => { if (props.armed) props.onConfirm(); else props.onArm() }}
    >
      {props.armed ? props.confirmLabel : props.label}
    </button>
  )
}
