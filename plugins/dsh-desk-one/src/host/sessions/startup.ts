/**
 * Startup sweep wiring: no immediate disk scan in apply (it would contend with the official session
 * list for the same full scan); instead run on "first open of the archive panel" plus a delayed
 * fallback, and wire official write events to cache invalidation and parent/child alignment.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { HeaderFactsStore } from './archive.js'
import { STARTUP_SCAN_DELAY_MS } from './constants.js'
import { alignChildArchives, sweepGhostArchivedIds } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { sweepStaleProjectionCache } from './projection.js'
import { healMissingSessionProjections } from './projection-seed.js'
import { trashedSessionIds } from './trash.js'

/** Run-once trigger for the three startup sweeps; `run` is idempotent. */
export interface StartupScans {
  run(): void
}

/**
 * Register startup sweeps and event listeners (all attached via ctx.effect, cleaned up on dispose).
 *
 * 2026-09-29: **no longer starts inside apply** — the three startup reads (sweeps ×2 plus alignment)
 * contend with the official session-list endpoint for the same full disk scan, which blocks the window
 * where the user waits for the list after opening the page (measured 40–90 s on real hardware).
 * @param ctx - host context.
 * @param surface - official workspace write channel.
 * @param headerFacts - header facts cache.
 * @param trashRoot - trash root directory: sweeps use it to keep projection rows of restorable sessions.
 */
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
      // Trash entries are absent from the persisted list but are still restorable sessions: collect their ids first so the projection sweep skips them.
      const preservedProjectionIds = await trashedSessionIds(trashRoot)
      await Promise.all([
        sweepGhostArchivedIds(ctx, surface, headerFacts),
        sweepStaleProjectionCache(ctx, headerFacts, preservedProjectionIds),
        alignChildArchives(ctx, surface, headerFacts),
      ])
      // Backfill last: repair projection rows that older sweeps deleted while the session was trashed (a healthy machine has no missing rows = zero I/O traversal).
      await healMissingSessionProjections(ctx, headerFacts)
    })().catch((error: unknown) => {
      ctx.logger.warn(`dsh-archive-manage: 启动扫描失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }
  const startupScanTimer = setTimeout(run, STARTUP_SCAN_DELAY_MS)
  ctx.effect(() => () => clearTimeout(startupScanTimer), 'dsh-archive-manage: 启动清扫兜底定时器')

  // Parent/child linkage: official workspace-domain write events drive real-time alignment (idempotent,
  // the same listener shape as the official feed); the same event invalidates the header cache in a
  // write-through path (external writes such as the official menu's archive never hit this plugin's routes).
  ctx.effect(() => ctx.on('domain/changed', (change) => {
    if (change.domain !== 'workspace' || change.operation !== 'put') return
    headerFacts.invalidate()
    void alignChildArchives(ctx, surface, headerFacts)
  }), 'dsh-archive-manage: 父子归档对齐')

  // Session add/remove events invalidate the header cache in a write-through path (the removed/added events our own writes re-emit also take this path).
  ctx.effect(() => ctx.on('api-session/added', () => headerFacts.invalidate()), 'dsh-archive-manage: header 缓存失效（added）')
  ctx.effect(() => ctx.on('api-session/removed', () => headerFacts.invalidate()), 'dsh-archive-manage: header 缓存失效（removed）')

  return { run }
}
