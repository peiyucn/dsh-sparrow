

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { creditSampleOf } from './credits-ledger.js'
import type { CreditEntry, CreditsView } from './credits-ledger.js'
import { CREDIT_PROJECTION_KEY } from './constants.js'


export interface CreditsModelRow {
  model: string
  credit: number
  calls: number
}


export interface CreditsTurnRow {
  credit: number
  calls: number
  byModel: CreditsModelRow[]
}


export interface CreditsProjectionState {
  credit: number
  calls: number
  byModel: CreditsModelRow[]

  byTurn: Record<string, CreditsTurnRow>
}


export function emptyCreditsState(): CreditsProjectionState {
  return { credit: 0, calls: 0, byModel: [], byTurn: {} }
}

const modelCreditsSchema = z.object({
  model: z.string(),


  credit: z.number(),
  calls: z.number().int().nonnegative(),
}).strict()

const turnCreditsSchema = z.object({
  credit: z.number(),
  calls: z.number().int().nonnegative(),
  byModel: z.array(modelCreditsSchema),
}).strict()


export const creditsProjectionStateSchema = z.object({
  credit: z.number(),
  calls: z.number().int().nonnegative(),
  byModel: z.array(modelCreditsSchema),


  byTurn: z.record(z.string(), turnCreditsSchema.strict()),
}).strict()


function addModelRow(rows: readonly CreditsModelRow[], sample: CreditEntry): CreditsModelRow[] {
  const index = rows.findIndex(row => row.model === sample.model)
  if (index < 0) return [...rows, { model: sample.model, credit: sample.credit, calls: 1 }]
  const next = rows.slice()
  const current = rows[index] as CreditsModelRow
  next[index] = { model: current.model, credit: current.credit + sample.credit, calls: current.calls + 1 }
  return next
}


export function applyCreditsEvent(state: CreditsProjectionState, event: SessionEvent): CreditsProjectionState {
  const sample = creditSampleOf(event)
  if (sample === undefined) return state
  const key = String(sample.turn)
  const turn = state.byTurn[key] ?? { credit: 0, calls: 0, byModel: [] }
  return {
    credit: state.credit + sample.credit,
    calls: state.calls + 1,
    byModel: addModelRow(state.byModel, sample),
    byTurn: {
      ...state.byTurn,
      [key]: {
        credit: turn.credit + sample.credit,
        calls: turn.calls + 1,
        byModel: addModelRow(turn.byModel, sample),
      },
    },
  }
}


export function viewOfCreditsState(state: CreditsProjectionState): CreditsView {
  return {
    session: () => ({ credit: state.credit, calls: state.calls, byModel: state.byModel }),
    turn: turn => state.byTurn[String(turn)] ?? { credit: 0, calls: 0, byModel: [] },
  }
}


export const codebuddyCreditsProjectionDefinition = {
  key: CREDIT_PROJECTION_KEY,
  stateVersion: 1,
  stateSchema: creditsProjectionStateSchema,
  init: () => emptyCreditsState(),
  apply: applyCreditsEvent,
} satisfies ProjectionDefinition<typeof CREDIT_PROJECTION_KEY, CreditsProjectionState>
