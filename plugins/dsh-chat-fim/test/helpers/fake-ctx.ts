

import type { assertCapabilities, assertHostCompatible } from '../../src/compat.js'


export type HostLogCtx =
  & Parameters<typeof assertCapabilities>[0]
  & Parameters<typeof assertHostCompatible>[0]


export function fakeHostCtx(): { ctx: HostLogCtx; warns: string[] } {
  const warns: string[] = []
  return { ctx: { logger: { warn: (message: string) => { warns.push(message) } } }, warns }
}
