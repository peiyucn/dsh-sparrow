

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { HeaderFactsStore } from './archive.js'
import { PACKAGE_NAME, STARTUP_SCAN_DELAY_MS } from './constants.js'
import { alignChildArchives, sweepGhostArchivedIds } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { sweepStaleProjectionCache } from './projection.js'
import { healMissingSessionProjections } from './projection-seed.js'
import { trashedSessionIds } from './trash.js'


export interface StartupScans {
  run(): void
}


export function installStartupScans(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
  trashRoot: string,
): StartupScans {
  let startupScansDone = false
  const run = (): void => {
    if (startupScansDone) return
    startupScansDone = true
    void (async () => {

      const preservedProjectionIds = await trashedSessionIds(trashRoot)
      await Promise.all([
        sweepGhostArchivedIds(ctx, surface, headerFacts),
        sweepStaleProjectionCache(ctx, headerFacts, preservedProjectionIds),
        alignChildArchives(ctx, surface, headerFacts),
      ])

      await healMissingSessionProjections(ctx, headerFacts)
    })().catch((error: unknown) => {
      ctx.logger.warn(`${PACKAGE_NAME}: 启动扫描失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }
  const startupScanTimer = setTimeout(run, STARTUP_SCAN_DELAY_MS)
  ctx.effect(() => () => clearTimeout(startupScanTimer), `${PACKAGE_NAME}: 启动清扫兜底定时器`)




  ctx.effect(() => ctx.on('domain/changed', (change) => {
    if (change.domain !== 'workspace' || change.operation !== 'put') return
    headerFacts.invalidate()
    void alignChildArchives(ctx, surface, headerFacts)
  }), `${PACKAGE_NAME}: 父子归档对齐`)


  ctx.effect(() => ctx.on('api-session/added', () => headerFacts.invalidate()), `${PACKAGE_NAME}: header 缓存失效（added）`)
  ctx.effect(() => ctx.on('api-session/removed', () => headerFacts.invalidate()), `${PACKAGE_NAME}: header 缓存失效（removed）`)

  return { run }
}
