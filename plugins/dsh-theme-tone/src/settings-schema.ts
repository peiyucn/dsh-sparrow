

import z from '@deepseek-ai/schemastery'
import { DARK_TONE_IDS, DEFAULT_SETTINGS, LIGHT_TONE_IDS } from './tones.js'


export const Config = z.object({
  lightTone: z.union([...LIGHT_TONE_IDS]).default(DEFAULT_SETTINGS.lightTone).volatile(),
  darkTone: z.union([...DARK_TONE_IDS]).default(DEFAULT_SETTINGS.darkTone).volatile(),
})
