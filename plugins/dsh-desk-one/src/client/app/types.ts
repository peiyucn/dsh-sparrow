/**
 * Shared client-side types.
 * Kept free of React and framework props so hooks/components can import them without cycles.
 */

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { DeskNote } from '../../contract.js'

export type Tab = 'overview' | 'notes' | 'tasks'
/** Locale translator injected by the panel seat; components take it as a prop. */
export type DeskTranslator = PropsLocale<typeof LOCALE_NAMESPACE>['t']

export interface WallSize {
  readonly width: number
  readonly height: number
}

/** A note resolved to its on-wall geometry (fallbacks applied, coordinates clamped). */
export interface PlacedNote {
  readonly note: DeskNote
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
}
