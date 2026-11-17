

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import type { DeskNote } from '../../contract.js'

export type Tab = 'notebook' | 'notes' | 'tasks' | 'schedule' | 'sessions'

export type DeskTranslator = PropsLocale<typeof LOCALE_NAMESPACE>['t']

export interface WallSize {
  readonly width: number
  readonly height: number
}


export interface PlacedNote {
  readonly note: DeskNote
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
}
