

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { API_KEY_ENV, LEGACY_API_KEY_ENV } from './constants.js'


export interface Config {

  apiKeyEnv: Volatile<string>

  maxMode: Volatile<boolean>

  autoAdapt: Volatile<boolean>
}

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(API_KEY_ENV).volatile(),
  maxMode: z.boolean().default(false).volatile(),
  autoAdapt: z.boolean().default(true).volatile(),
})


export function keyRefs(apiKeyEnv: string | undefined): readonly string[] {
  const primary = apiKeyEnv ?? API_KEY_ENV
  const refs = [primary, LEGACY_API_KEY_ENV]
  return refs.filter((ref, index) => refs.indexOf(ref) === index)
}
