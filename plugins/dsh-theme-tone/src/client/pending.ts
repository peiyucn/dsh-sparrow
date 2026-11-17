

import type { DarkToneId, LightToneId, ThemeToneSettings, ToneId } from '../tones.js'


export type ToneField = 'lightTone' | 'darkTone'


export interface PendingToneWrite {
  readonly field: ToneField
  readonly id: ToneId

  readonly seq: number
}


export interface PendingToneTracker {

  begin(field: ToneField, id: ToneId): PendingToneWrite

  settle(write: PendingToneWrite): boolean

  over(base: ThemeToneSettings): ThemeToneSettings
}

export function createPendingToneTracker(): PendingToneTracker {

  const latest = new Map<ToneField, PendingToneWrite>()
  let seq = 0

  return {
    begin(field, id) {
      const write: PendingToneWrite = { field, id, seq: ++seq }
      latest.set(field, write)
      return write
    },

    settle(write) {
      const current = latest.get(write.field)

      if (current === undefined || current.seq !== write.seq) return false
      latest.delete(write.field)
      return true
    },

    over(base) {
      if (latest.size === 0) return base
      let merged = base
      for (const write of latest.values()) {

        merged = write.field === 'darkTone'
          ? { ...merged, darkTone: write.id as DarkToneId }
          : { ...merged, lightTone: write.id as LightToneId }
      }
      return merged
    },
  }
}
