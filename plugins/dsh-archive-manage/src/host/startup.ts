/**
 * 启动清扫接线：不在 apply 里立刻扫盘（会与官方会话列表抢同一次全量扫描），改为
 * 「首次打开归档面板时补跑」+ 一条延迟兜底；同时把官方写事件接成缓存失效与父子对齐。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { HeaderFactsStore } from '../archive.js'
import { STARTUP_SCAN_DELAY_MS } from '../constants.js'
import { alignChildArchives, sweepGhostArchivedIds } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import type { HeaderFacts } from './headers.js'
import { sweepStaleProjectionCache } from './projection.js'

/** 启动三项清扫的「只跑一次」触发器；`run` 幂等。 */
export interface StartupScans {
  run(): void
}

/**
 * 注册启动清扫与事件监听（全部挂在 ctx.effect 上，卸载即清理）。
 *
 * 2026-09-29：**不再在 apply 里立刻发起**——三项启动读取（清扫 ×2 + 对齐）与官方会话列表接口
 * 抢同一次全量扫盘，会压住用户打开页面后等列表的窗口（真机实测 40–90 s）。
 */
export function installStartupScans(
  ctx: Context,
  surface: RegistryMutationSurface,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): StartupScans {
  let startupScansDone = false
  const run = (): void => {
    if (startupScansDone) return
    startupScansDone = true
    void sweepGhostArchivedIds(ctx, surface, headerFacts)
    void sweepStaleProjectionCache(ctx, headerFacts)
    void alignChildArchives(ctx, surface, headerFacts)
  }
  const startupScanTimer = setTimeout(run, STARTUP_SCAN_DELAY_MS)
  ctx.effect(() => () => clearTimeout(startupScanTimer), 'dsh-archive-manage: 启动清扫兜底定时器')

  // 父子联动：官方 workspace 域写入事件驱动实时对齐（幂等，官方 feed 同款监听）。
  // 同事件写穿失效 header 缓存（官方菜单归档等外部写不经过本插件路由）。
  ctx.effect(() => ctx.on('domain/changed', (change) => {
    if (change.domain !== 'workspace' || change.operation !== 'put') return
    headerFacts.invalidate()
    void alignChildArchives(ctx, surface, headerFacts)
  }), 'dsh-archive-manage: 父子归档对齐')

  // 会话进出事件写穿失效 header 缓存（自身写操作补发的 removed/added 亦经此路径）。
  ctx.effect(() => ctx.on('api-session/added', () => headerFacts.invalidate()), 'dsh-archive-manage: header 缓存失效（added）')
  ctx.effect(() => ctx.on('api-session/removed', () => headerFacts.invalidate()), 'dsh-archive-manage: header 缓存失效（removed）')

  return { run }
}
