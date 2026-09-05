/** client half 纯逻辑：目录 store 惰性订阅（首帧会话 scope 未就绪时延迟挂接，解析后订阅迁移）。 */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** 官方目录 store 最小面：快照（含 current 字段）+ 订阅（与 modelDirectories 的 store 同构）。 */
export interface LazyDirectorySource<S> {
  getSnapshot(): { current: S | null }
  subscribe(listener: () => void): () => void
}

/**
 * 目录 store 惰性读取面：首帧会话 scope 未就绪时 directoryFor 会抛错——
 * 不弃权，getSnapshot/subscribe 每次读取重试，解析成功后把等待中的订阅迁移到真实 store。
 * 迁移（而非仅通知后清空）是必要的：useSyncExternalStore 只会在 subscribe 身份变化时重订阅，
 * 本适配器的 subscribe 身份稳定，若解析后监听器仍留在未决集合里，此后真实 store 的
 * 模型变更不会触达订阅者，目录快照滞留到下一次无关重渲染（2026-09 审计修复）。
 */
export function createLazyDirectoryStore<S>(
  directoryFor: (sessionId: SessionId) => LazyDirectorySource<S> | undefined,
  sessionId: SessionId | undefined,
): { getSnapshot: () => S | null; subscribe: (listener: () => void) => () => void } {
  let resolved: LazyDirectorySource<S> | undefined
  /** 未决订阅表：listener → 迁入真实 store 后的退订函数（迁移前为 undefined）。 */
  const pending = new Map<() => void, (() => void) | undefined>()
  const ensure = (): LazyDirectorySource<S> | undefined => {
    if (resolved !== undefined) return resolved
    if (sessionId === undefined) return undefined
    try {
      const hit = directoryFor(sessionId)
      if (hit !== undefined) {
        resolved = hit
        // 订阅迁移：每个等待中的监听器挂到真实 store（退订函数存回 pending 供清理），并立即通知一次。
        for (const listener of pending.keys()) {
          pending.set(listener, hit.subscribe(listener))
          listener()
        }
      }
    } catch {
      // 会话 scope 尚未就绪：保持未决，下一次读取重试。
    }
    return resolved
  }
  return {
    getSnapshot: () => ensure()?.getSnapshot().current ?? null,
    subscribe: (listener) => {
      const hit = ensure()
      if (hit !== undefined) return hit.subscribe(listener)
      pending.set(listener, undefined)
      return () => {
        pending.get(listener)?.()
        pending.delete(listener)
      }
    },
  }
}
