

import type { warnMissingCapabilities, warnUser } from '../../src/compat.js'


export type HostLogCtx =
  & Parameters<typeof warnUser>[0]
  & Parameters<typeof warnMissingCapabilities>[0]


export function fakeHostCtx(): { ctx: HostLogCtx; warns: string[] } {
  const warns: string[] = []
  return { ctx: { logger: { warn: (message: string) => { warns.push(message) } } }, warns }
}
