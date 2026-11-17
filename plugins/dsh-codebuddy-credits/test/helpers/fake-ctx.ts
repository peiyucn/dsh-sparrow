

import type { assertCapabilities } from '../../src/compat.js'


export type HostLogCtx = Parameters<typeof assertCapabilities>[0]


export function fakeHostCtx(): { ctx: HostLogCtx; warns: string[] } {
  const warns: string[] = []
  return { ctx: { logger: { warn: (message: string) => { warns.push(message) } } }, warns }
}
